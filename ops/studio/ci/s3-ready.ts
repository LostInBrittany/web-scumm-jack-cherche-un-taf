// Is the CI's S3 ready? (4.2.1, the `studio-hosted` job): one object written, read back and deleted through the
// Studio's own S3 client, with STUDIO_TEST_S3 (`http://key:secret@host:port/bucket`). Exits 0 when it is, 1 otherwise.
import { S3 } from '../../../studio-server/src/server/s3';

const u = new URL(process.env.STUDIO_TEST_S3 ?? '');
const s3 = new S3({
  endpoint: `${u.protocol}//${u.host}`,
  bucket: u.pathname.slice(1),
  keyId: decodeURIComponent(u.username),
  secret: decodeURIComponent(u.password),
});
try {
  await s3.put('ready', Buffer.from('ok'));
  const back = await s3.get('ready');
  await s3.delete('ready');
  process.exit(back?.toString() === 'ok' ? 0 : 1);
} catch {
  process.exit(1);
}
