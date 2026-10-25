// The four connectors of 4.1.9, by id, built from the operator's configuration section (wiki/en/bridge.connectors.md).
import { type BadgeConfig, OpenBadgeConnector } from './badges/connector';
import { EmailConnector, emailConfig } from './email/connector';
import type { RealityConnector } from './sdk';
import { SshConnector, sshConfig } from './ssh/connector';
import { type TelnetConfig, TelnetConnector } from './telnet/connector';

export const CONNECTOR_IDS = ['email', 'telnet', 'ssh', 'open-badge'];

export function makeConnector(id: string, section: unknown, o: { baseDir: string }): RealityConnector {
  const c = (section && typeof section === 'object' ? section : {}) as Record<string, unknown>;
  if (id === 'email') return new EmailConnector(emailConfig(c, o.baseDir));
  if (id === 'telnet') return new TelnetConnector(c as unknown as TelnetConfig);
  if (id === 'ssh') return new SshConnector(sshConfig(c, o.baseDir));
  if (id === 'open-badge') {
    // The test-only network escapes are never read from a configuration file.
    const { testing: _, resolve: __, ...safe } = c as unknown as BadgeConfig;
    return new OpenBadgeConnector(safe);
  }
  throw new Error(`unknown connector "${id}"`);
}
