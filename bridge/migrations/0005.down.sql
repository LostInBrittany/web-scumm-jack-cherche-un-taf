-- Version 5 undone: no maintenance leases (a migration down below 5 asks every writer stopped, wiki/en/install.upgrade.md).
DROP INDEX maintenance_expires;
DROP INDEX maintenance_one_exclusive;
DROP TABLE maintenance;
