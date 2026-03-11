import { ensureConfigFile } from "../config.ts";

try {
  const result = await ensureConfigFile();

  if (result.created) {
    console.log(`Created config at ${result.path}`);
  } else if (result.updated) {
    console.log(`Updated config defaults at ${result.path}`);
  } else {
    console.log(`Config already up to date at ${result.path}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
