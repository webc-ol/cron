#!/usr/bin/env bun

import cdn from "./cdn.js";
import { X509Certificate } from "crypto";
import retry from "@3-/retry";
import Freessl from "@3-/ssl/Freessl.js";
import FREESSL from "../conf/FREESSL.js";
import HOST_HW from "../conf/host/HW.js";
import R from "./R.js";
import DNS from "./DNS.js";
import rsync, { runHook } from "./rsync.js";

const NOW = new Date(),
  ssl = Freessl(...FREESSL),
  gen = retry(async (dns, domain) => {
    const r_key = "ssl:" + domain;
    let key_crt = await R.get(r_key),
      renew = 0;

    if (key_crt) {
      key_crt = JSON.parse(key_crt);
      try {
        const expire = new Date(new X509Certificate(key_crt[1]).validTo);
        if ((expire - NOW) / 864e5 > 30) {
          console.log(domain, "expire", expire.toISOString().slice(0, 10));

          /*
            注释掉下面这一行，可以强制重新绑定，添加平台新域名的时候可以用
          */
          return 0;
        } else {
          renew = 1;
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      renew = 1;
    }

    console.log(dns, domain);

    const { reset, rm } = await DNS[dns](domain);

    if (renew) {
      const set_done = new Set();
      key_crt = await ssl(
        domain,
        async (prefix, val) => {
          if (set_done.has(val)) return;
          set_done.add(val);
          await reset(prefix, { TXT: Array.from(set_done) });
          // wait 10s for DNS propagation
          await new Promise((resolve) => setTimeout(resolve, 10000));
        },
        rm,
      );
      await R.set(r_key, JSON.stringify(key_crt), { EX: 7776e3 });
    }

    try {
      await rsync(domain, key_crt);
    } catch (e) {
      console.warn(`rsync failed for ${domain}:`, e.message || e);
    }

    return key_crt;
  }),
  genAll = async () => {
    let err_count = 0;
    const updates = new Map();
    for (const domain of Object.keys(HOST_HW)) {
      try {
        const key_crt = await gen("hw", domain);
        if (key_crt) updates.set(domain, key_crt);
      } catch (e) {
        ++err_count;
        console.error("hw", domain, e);
      }
    }
    if (updates.size > 0) {
      try {
        await runHook();
      } catch (e) {
        console.warn("runHook failed:", e.message || e);
      }
      await cdn(updates);
    }
    return err_count;
  };

if (import.meta.main) {
  await genAll();
  process.exit();
}
