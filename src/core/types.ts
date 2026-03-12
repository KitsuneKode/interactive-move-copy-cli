export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  modifiedAt: Date;
  icon: string;
  formattedSize: string;
  formattedDate: string;
  readable: boolean;
}

export interface SelectionState {
  selected: Set<string>;
  cursor: number;
  scrollOffset: number;
  searchQuery: string;
  currentDir: string;
}

export interface KeyEvent {
  name: string;
  raw: Buffer;
  ctrl: boolean;
  shift: boolean;
  char: string;
}

export type OperationMode = "move" | "copy" | "remove";
export type RemovalMode = "trash" | "hard-delete";
export type OperationStrategy =
  | "rename"
  | "verified_copy"
  | "verified_copy_delete"
  | "trash_rename"
  | "trash_verified"
  | "hard_delete";

export interface FuzzyResult {
  matches: boolean;
  score: number;
  positions: number[];
}

export interface ExecutionResult {
  source: string;
  dest: string;
  success: boolean;
  error?: string;
  strategy: OperationStrategy;
  verified: boolean;
  bytesVerified: number;
  recoveryPath?: string;
}
