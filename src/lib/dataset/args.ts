export interface CliOptions {
  root?: string;
  configPath?: string;
  split?: "validation" | "test";
  json: boolean;
  csv: boolean;
  writeConfig: boolean;
}

const meaningful = (value: string | undefined) => {
  const normalized = value?.replace(/^["']|["']$/g, "");
  return normalized && !/^(true|false)$/i.test(normalized) && !normalized.startsWith("--")
    ? normalized
    : undefined;
};

export function parseCliOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): CliOptions {
  let explicitRoot: string | undefined;
  let explicitConfig: string | undefined;
  let explicitSplit: "validation" | "test" | undefined;

  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root") {
      explicitRoot = meaningful(args[i + 1]);
      i++;
      continue;
    }
    if (arg.startsWith("--root=")) {
      explicitRoot = meaningful(arg.slice(7));
      continue;
    }
    if (arg === "--config") {
      explicitConfig = meaningful(args[i + 1]);
      i++;
      continue;
    }
    if (arg.startsWith("--config=")) {
      explicitConfig = meaningful(arg.slice(9));
      continue;
    }
    if (arg === "--split") {
      const s = meaningful(args[i + 1]);
      if (s === "validation" || s === "test") explicitSplit = s;
      i++;
      continue;
    }
    if (arg.startsWith("--split=")) {
      const s = meaningful(arg.slice(8));
      if (s === "validation" || s === "test") explicitSplit = s;
      continue;
    }
    if (!arg.startsWith("--")) {
      const m = meaningful(arg);
      if (m) positionals.push(m);
    }
  }

  const writeConfig = args.includes("--write-config") || args.includes("--write-config=true");

  const positionalRoot: string | undefined = positionals[0];
  let positionalConfig: string | undefined;
  let positionalSplit: "validation" | "test" | undefined;

  for (let k = 1; k < positionals.length; k++) {
    const item = positionals[k];
    if (item === "validation" || item === "test") {
      positionalSplit = item;
    } else if (!positionalConfig) {
      positionalConfig = item;
    }
  }

  const envSplit = env.npm_config_split;
  const validEnvSplit = envSplit === "validation" || envSplit === "test" ? envSplit : undefined;

  return {
    root: explicitRoot ?? positionalRoot ?? meaningful(env.npm_config_root),
    configPath: explicitConfig ?? positionalConfig ?? meaningful(env.npm_config_config),
    split: explicitSplit ?? positionalSplit ?? validEnvSplit,
    json: args.includes("--json") || env.npm_config_json === "true",
    csv: args.includes("--csv") || env.npm_config_csv === "true",
    writeConfig,
  };
}
