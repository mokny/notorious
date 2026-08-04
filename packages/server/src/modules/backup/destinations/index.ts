import type { BackupDestinationClient, ResolvedDestinationConfig } from "./types.js";
import { createLocalDestinationClient } from "./local.js";
import { createSftpDestinationClient } from "./sftp.js";
import { createFtpDestinationClient } from "./ftp.js";
import { createSambaDestinationClient } from "./samba.js";

export function createDestinationClient(workspaceId: string, config: ResolvedDestinationConfig): BackupDestinationClient {
  switch (config.type) {
    case "local":
      return createLocalDestinationClient(workspaceId, config);
    case "sftp":
      return createSftpDestinationClient(config);
    case "ftp":
      return createFtpDestinationClient(config);
    case "samba":
      return createSambaDestinationClient(config);
  }
}

export type { BackupDestinationClient, ResolvedDestinationConfig, TransferProgress } from "./types.js";
