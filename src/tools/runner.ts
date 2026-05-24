import { z } from "zod";
import { readFileSync } from "node:fs";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { allTools } from "./registry.js";

/**
 * Declarative workflow runner. Workflow file shape:
 *
 *   {
 *     "name": "Release v1.2.3",
 *     "vars": { "appId": "1234", "newVersion": "1.2.3" },
 *     "steps": [
 *       {
 *         "name": "create",
 *         "tool": "asc_versions_create",
 *         "input": { "appId": "${vars.appId}", "platform": "IOS", "versionString": "${vars.newVersion}" },
 *         "if": "${vars.dryRun}",                  // optional truthy gate
 *         "continueOnError": false,                 // default false — abort run on error
 *         "saveAs": "newVersion"                    // optional alias for the step result
 *       }
 *     ]
 *   }
 *
 * Template syntax in `input`:
 *   "${vars.foo}"            → vars.foo  (whole-string match returns the original type)
 *   "prefix-${vars.foo}-x"   → string interpolation
 *   "${steps.stepName.data.id}" → dotted path into a prior step's result
 */

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function resolveValue(value: unknown, ctx: { vars: Record<string, unknown>; steps: Record<string, unknown> }): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    // Whole-string template: return the raw resolved value (preserves type)
    const whole = value.match(/^\$\{([^}]+)\}$/);
    if (whole) return getPath(ctx, whole[1]);
    // Interpolation
    return value.replace(/\$\{([^}]+)\}/g, (_m, p1) => {
      const v = getPath(ctx, p1);
      return v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, ctx));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveValue(v, ctx);
    }
    return out;
  }
  return value;
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 0 && value.toLowerCase() !== "false";
  if (typeof value === "number") return value !== 0;
  return true;
}

const StepSchema = z.object({
  name: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  if: z.unknown().optional(),
  continueOnError: z.boolean().optional(),
  saveAs: z.string().optional(),
});

const WorkflowSchema = z.object({
  name: z.string().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(StepSchema).min(1),
});

export function runnerTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_workflow_run",
      description:
        "Run a declarative workflow JSON file. Steps reference other asc_* tools; values support `${vars.x}` and `${steps.stepName.path}` templates. Set dryRun=true to validate + return per-step planned input without executing writes.",
      inputSchema: z.object({
        workflowPath: z.string().optional().describe("Absolute path to a workflow JSON file"),
        workflow: z.record(z.string(), z.unknown()).optional().describe("Inline workflow object (alternative to workflowPath)"),
        vars: z.record(z.string(), z.unknown()).optional().describe("Override / supplement workflow.vars"),
        dryRun: z.boolean().default(false).describe("Propagates dryRun=true to every step's input"),
      }),
      handler: async ({ workflowPath, workflow, vars, dryRun }) => {
        let raw: unknown;
        if (workflowPath) raw = JSON.parse(readFileSync(workflowPath, "utf8"));
        else if (workflow) raw = workflow;
        else throw new Error("Provide workflowPath or workflow");

        const wf = WorkflowSchema.parse(raw);
        const tools = allTools(client);
        const toolMap = new Map(tools.map((t) => [t.name, t] as const));

        const ctx = {
          vars: { ...(wf.vars ?? {}), ...(vars ?? {}) },
          steps: {} as Record<string, unknown>,
        };

        const log: Array<{ step: string; tool: string; status: "ran" | "skipped" | "error"; input?: unknown; result?: unknown; error?: string }> = [];

        for (const step of wf.steps) {
          if (step.if !== undefined) {
            const cond = resolveValue(step.if, ctx);
            if (!isTruthy(cond)) {
              log.push({ step: step.name, tool: step.tool, status: "skipped" });
              continue;
            }
          }
          const tool = toolMap.get(step.tool);
          if (!tool) {
            const err = `Unknown tool: ${step.tool}`;
            log.push({ step: step.name, tool: step.tool, status: "error", error: err });
            if (!step.continueOnError) throw new Error(err);
            continue;
          }
          let resolvedInput = (resolveValue(step.input ?? {}, ctx) ?? {}) as Record<string, unknown>;
          if (dryRun && !("dryRun" in resolvedInput)) {
            resolvedInput = { ...resolvedInput, dryRun: true };
          }
          try {
            const parsed = tool.inputSchema.parse(resolvedInput);
            const result = await tool.handler(parsed);
            ctx.steps[step.saveAs ?? step.name] = result;
            log.push({ step: step.name, tool: step.tool, status: "ran", input: resolvedInput, result });
          } catch (err) {
            const msg = (err as Error).message;
            log.push({ step: step.name, tool: step.tool, status: "error", input: resolvedInput, error: msg });
            if (!step.continueOnError) throw new Error(`Step "${step.name}" failed: ${msg}`);
          }
        }

        return { name: wf.name, executed: log.filter((l) => l.status === "ran").length, log };
      },
    },
    {
      name: "asc_workflow_validate",
      description: "Validate a workflow file's structure (does not execute).",
      inputSchema: z.object({
        workflowPath: z.string().optional(),
        workflow: z.record(z.string(), z.unknown()).optional(),
      }),
      handler: async ({ workflowPath, workflow }) => {
        const raw: unknown = workflowPath ? JSON.parse(readFileSync(workflowPath, "utf8")) : workflow;
        if (!raw) throw new Error("Provide workflowPath or workflow");
        const wf = WorkflowSchema.parse(raw);
        const tools = allTools(client);
        const known = new Set(tools.map((t) => t.name));
        const unknown = wf.steps.filter((s) => !known.has(s.tool)).map((s) => s.tool);
        return {
          name: wf.name,
          stepCount: wf.steps.length,
          unknownTools: unknown,
          valid: unknown.length === 0,
        };
      },
    },
  ];
}
