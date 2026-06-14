import HOST_HW from "../conf/host/HW.js";
import { ssl } from "tencentcloud-sdk-nodejs-ssl";
import { teo } from "tencentcloud-sdk-nodejs-teo";
import { SecretId, SecretKey } from "../conf/TENCENT.js";

const SslClient = ssl.v20191205.Client;
const TeoClient = teo.v20220901.Client;

const sslClient = new SslClient({
  credential: { secretId: SecretId, secretKey: SecretKey },
  region: "ap-guangzhou",
});

const teoClient = new TeoClient({
  credential: { secretId: SecretId, secretKey: SecretKey },
  region: "ap-guangzhou",
});

export default async (updates) => {
  for (const [domain, [key, crt]] of updates) {
    const host_conf = HOST_HW[domain];
    if (!host_conf) {
      console.log(`No host configuration found for ${domain}`);
      continue;
    }
    const tencent_conf = host_conf.TENCENT;
    if (!tencent_conf) {
      console.log(`No Tencent configuration found for ${domain}`);
      continue;
    }
    const edgeone = tencent_conf.edgeone;
    if (edgeone) {
      // 1. Upload certificate to Tencent SSL Certificates Console
      console.log(`Uploading certificate for ${domain}...`);
      const uploadRes = await sslClient.UploadCertificate({
        CertificatePublicKey: crt,
        CertificatePrivateKey: key,
        CertificateType: "SVR",
        Alias: `${domain}-${Date.now()}`,
      });
      const certId = uploadRes.CertificateId;
      console.log(`Uploaded certificate to Tencent SSL. CertId: ${certId}`);

      // 2. Map edgeone config to host list
      // edgeone: ["", "*"] => ["webc.site", "*.webc.site"]
      const hosts = edgeone.map((sub) => (sub ? `${sub}.${domain}` : domain));
      console.log(`Hosts to update in EdgeOne:`, hosts);

      // 3. Find ZoneId for domain
      console.log(`Fetching ZoneId for ${domain}...`);
      const zonesRes = await teoClient.DescribeZones({ Limit: 100 });
      const zone = (zonesRes.Zones || []).find((z) => z.ZoneName === domain);
      if (!zone) {
        throw new Error(`Zone for domain ${domain} not found in Tencent EdgeOne`);
      }
      const zoneId = zone.ZoneId;
      console.log(`Found ZoneId: ${zoneId}`);

      // 4. Update HTTPS certificate for hosts in EdgeOne
      console.log(`Updating hosts certificate in EdgeOne...`);
      await teoClient.ModifyHostsCertificate({
        ZoneId: zoneId,
        Hosts: hosts,
        Mode: "sslcert",
        ServerCertInfo: [
          {
            CertId: certId,
          },
        ],
      });
      console.log(`Successfully updated certificate for ${domain} in Tencent EdgeOne!`);
    }
  }
};
