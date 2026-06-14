#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { teo } from "tencentcloud-sdk-nodejs-teo";
import { SecretId, SecretKey } from "../conf/TENCENT.js";

const Client = teo.v20220901.Client,
  client = new Client({
    credential: { secretId: SecretId, secretKey: SecretKey },
    region: "ap-guangzhou",
  }),
  argv = await yargs(hideBin(process.argv))
    .command("$0 <domain>", "关闭在腾讯云 EdgeOne 中的重定向并删除相应规则", (y) => {
      y.positional("domain", {
        type: "string",
        describe: "域名（例如 *.webc.site 或 webc.site）",
      });
    })
    .help()
    .parse(),
  { domain } = argv;

async function getZone(client, domain) {
  console.log(`正在获取域名 ${domain} 的 ZoneId...`);
  const { Zones = [] } = await client.DescribeZones({ Limit: 100 }),
    zone = Zones.find((z) => domain === z.ZoneName || domain.endsWith("." + z.ZoneName));
  if (!zone) {
    throw new Error(`未找到域名匹配的 EdgeOne 站点：${domain}`);
  }
  console.log(`找到 ZoneId: ${zone.ZoneId} (站点名称: ${zone.ZoneName})`);
  return zone;
}

async function deleteRule(client, zoneId, ruleName) {
  console.log(`正在检查规则 "${ruleName}" 是否存在...`);
  const { Rules = [] } = await client.DescribeL7AccRules({ ZoneId: zoneId }),
    rule = Rules.find((r) => r.RuleName === ruleName);

  if (rule) {
    console.log(`找到规则 (ID: ${rule.RuleId})。正在删除...`);
    await client.DeleteL7AccRules({
      ZoneId: zoneId,
      RuleIds: [rule.RuleId],
    });
    console.log(`规则 "${ruleName}" 已成功删除。`);
  } else {
    console.log(`规则 "${ruleName}" 不存在，无需删除。`);
  }
}

try {
  const zone = await getZone(client, domain),
    ruleName = `redirect-${domain}`;

  await deleteRule(client, zone.ZoneId, ruleName);
  console.log("操作完成！");
} catch (e) {
  console.error("关闭重定向失败:", e.message || e);
  process.exit(1);
}
