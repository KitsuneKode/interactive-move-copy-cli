const EXT_ICONS: Record<string, string> = {
  // Languages
  ".ts": "\ue628", //
  ".tsx": "\ue7ba", //
  ".js": "\ue74e", //
  ".jsx": "\ue7ba", //
  ".py": "\ue73c", //
  ".rs": "\ue7a8", //
  ".go": "\ue627", //
  ".rb": "\ue739", //
  ".java": "\ue738", //
  ".c": "\ue61e", //
  ".cpp": "\ue61d", //
  ".h": "\ue61e", //
  ".cs": "\uf81a", //
  ".php": "\ue73d", //
  ".swift": "\ue755", //
  ".lua": "\ue620", //
  ".zig": "\ue6a9", //

  // Config / Data
  ".json": "\ue60b", //
  ".yaml": "\ue6a8", //
  ".yml": "\ue6a8", //
  ".toml": "\ue6b2", //
  ".xml": "\ue619", //
  ".ini": "\ue615", //
  ".env": "\uf462", //

  // Web
  ".html": "\ue736", //
  ".css": "\ue749", //
  ".scss": "\ue749", //
  ".svg": "\uf1c5", //

  // Shell / Scripts
  ".sh": "\ue795", //
  ".bash": "\ue795", //
  ".zsh": "\ue795", //
  ".fish": "\ue795", //

  // Docs
  ".md": "\ue73e", //
  ".txt": "\uf15c", //
  ".pdf": "\uf1c1", //

  // Images
  ".png": "\uf1c5", //
  ".jpg": "\uf1c5", //
  ".jpeg": "\uf1c5", //
  ".gif": "\uf1c5", //
  ".webp": "\uf1c5", //
  ".ico": "\uf1c5", //

  // Archives
  ".zip": "\uf410", //
  ".tar": "\uf410", //
  ".gz": "\uf410", //
  ".bz2": "\uf410", //
  ".xz": "\uf410", //
  ".7z": "\uf410", //

  // Lock files
  ".lock": "\uf023", //

  // Misc
  ".sql": "\ue706", //
  ".graphql": "\ue662", //
  ".wasm": "\ue6a1", //
  ".docker": "\ue7b0", //
};

const SPECIAL_NAMES: Record<string, string> = {
  Dockerfile: "\ue7b0", //
  "docker-compose.yml": "\ue7b0",
  "docker-compose.yaml": "\ue7b0",
  Makefile: "\ue615", //
  ".gitignore": "\ue702", //
  ".gitmodules": "\ue702",
  ".gitattributes": "\ue702",
  "package.json": "\ue71e", //
  "tsconfig.json": "\ue628", //
  "bun.lockb": "\uf487", //
  LICENSE: "\uf48a", //
  "README.md": "\uf48a",
  ".env": "\uf462",
  ".env.local": "\uf462",
  ".editorconfig": "\ue615",
  ".prettierrc": "\ue615",
  ".eslintrc": "\ue615",
};

const DIR_ICON = "\uf07b"; //
const SYMLINK_ICON = "\uf0c1"; //
const DEFAULT_ICON = "\uf15b"; //
const LOCK_ICON = "\uf023"; //

export function getIcon(
  name: string,
  isDirectory: boolean,
  isSymlink: boolean,
  readable: boolean,
): string {
  if (!readable) return LOCK_ICON;
  if (isSymlink) return SYMLINK_ICON;
  if (isDirectory) return DIR_ICON;

  if (SPECIAL_NAMES[name]) return SPECIAL_NAMES[name];

  const dotIdx = name.lastIndexOf(".");
  if (dotIdx !== -1) {
    const ext = name.slice(dotIdx).toLowerCase();
    if (EXT_ICONS[ext]) return EXT_ICONS[ext];
  }

  return DEFAULT_ICON;
}
