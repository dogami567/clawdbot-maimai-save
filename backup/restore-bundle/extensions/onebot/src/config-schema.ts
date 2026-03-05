import {
  buildChannelConfigSchema,
} from "clawdbot/plugin-sdk";
import { z } from "zod";

const GroupPolicySchema = z.enum(["open", "disabled", "allowlist"]);
const DmPolicySchema = z.enum(["pairing", "allowlist", "open", "disabled"]);

const MarkdownTableModeSchema = z.enum(["off", "bullets", "code"]);
const MarkdownConfigSchema = z
  .object({
    tables: MarkdownTableModeSchema.optional(),
  })
  .strict()
  .optional();

const ToolPolicySchema = z
  .object({
    allow: z.array(z.string()).optional(),
    alsoAllow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict();

const allowFromEntry = z.union([z.string(), z.number()]);

export const OneBotGroupConfigSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema.optional(),
  })
  .strict();

export type OneBotGroupConfig = z.infer<typeof OneBotGroupConfigSchema>;

export const OneBotConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,

    /** OneBot HTTP API base URL (used for outbound and probing). */
    httpUrl: z.string().optional(),

    /** OneBot WebSocket URL for inbound events. */
    wsUrl: z.string().optional(),

    /** Optional OneBot access token (Authorization: Bearer ...). */
    accessToken: z.string().optional(),

    /** HTTP timeout (ms) for OneBot API calls. */
    apiTimeoutMs: z.number().int().positive().optional(),

    dmPolicy: DmPolicySchema.optional(),
    allowFrom: z.array(allowFromEntry).optional(),

    groupPolicy: GroupPolicySchema.optional(),
    groupAllowFrom: z.array(allowFromEntry).optional(),

    /** Group allowlist + per-group config (requireMention/tools). */
    groups: z.record(z.string(), OneBotGroupConfigSchema).optional(),
  })
  .strict();

export type OneBotConfig = z.infer<typeof OneBotConfigSchema>;

export const onebotChannelConfigSchema = buildChannelConfigSchema(OneBotConfigSchema);
