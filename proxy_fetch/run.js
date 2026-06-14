#!/usr/bin/env bun

import tidb from "../../conf/TIDB.serverless.js";
import run from "@1-/proxy_fetch/run.js";

await run(tidb("webc"));
