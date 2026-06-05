import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadAgentConfig,
  loadD1Readiness,
  testLlm,
  testSearch
} from "@/lib/api";
import { type AdminAgentConfigResponse, type AdminD1ReadinessResponse } from "@personal-agent/shared";
import { useState } from "react";
import { toast } from "sonner";
import { CodeBlock, Field, useAsyncData } from "./resource-common";

export function SettingsPage(props: { diagnostics?: boolean }) {
  const config = useAsyncData(() => loadAgentConfig(), []);
  const d1Readiness = useAsyncData(() => loadD1Readiness(), []);
  const [prompt, setPrompt] = useState("用一句话介绍当前 agent 状态");
  const [query, setQuery] = useState("Cloudflare Workers");
  const [llmOutput, setLlmOutput] = useState<string | null>(null);
  const [searchOutput, setSearchOutput] = useState<unknown | null>(null);

  async function runLlmTest() {
    try {
      const response = await testLlm(prompt);
      setLlmOutput(response.output);
      toast.success("LLM test completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LLM 测试失败");
    }
  }

  async function runSearchTest() {
    try {
      const response = await testSearch(query);
      setSearchOutput(response.results);
      toast.success("Search test completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search 测试失败");
    }
  }

  return (
    <>
      <PageHeader
        description="密钥只显示配置状态，不在 Admin 暴露。"
        title={props.diagnostics ? "Diagnostics" : "Settings"}
      />
      {config.loading || d1Readiness.loading ? (
        <Skeleton className="h-64" />
      ) : null}
      {config.data ? (
        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <SettingsSummary
            config={config.data}
            d1Readiness={d1Readiness.data ?? undefined}
          />
          <Card>
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
              <CardDescription>测试 provider 配置是否可用。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field label="Test LLM prompt">
                <Input
                  onChange={(event) => setPrompt(event.target.value)}
                  value={prompt}
                />
              </Field>
              <Button
                disabled={!prompt.trim()}
                onClick={() => void runLlmTest()}
                type="button"
              >
                Test LLM
              </Button>
              {llmOutput ? <CodeBlock value={llmOutput} /> : null}
              <Field label="Test search query">
                <Input
                  onChange={(event) => setQuery(event.target.value)}
                  value={query}
                />
              </Field>
              <Button
                disabled={!query.trim()}
                onClick={() => void runSearchTest()}
                type="button"
                variant="secondary"
              >
                Test Search
              </Button>
              {searchOutput ? <CodeBlock value={searchOutput} /> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function SettingsSummary(props: {
  config: AdminAgentConfigResponse;
  d1Readiness?: AdminD1ReadinessResponse;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Configuration</CardTitle>
        <CardDescription>Cloudflare Worker runtime config.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">LLM</span>
          <StatusBadge status={props.config.llmConfigured ? "configured" : "missing"} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Brave Search</span>
          <StatusBadge
            status={props.config.braveSearchConfigured ? "configured" : "missing"}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Base URL</span>
          <span>{props.config.llmBaseUrl ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Model</span>
          <span>{props.config.llmModel ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Max tool rounds</span>
          <span>{props.config.maxToolRounds}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Fetch URL max bytes</span>
          <span>{props.config.fetchUrlMaxBytes}</span>
        </div>
        <div className="border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">D1 schema</span>
            <StatusBadge
              status={props.d1Readiness?.ok ? "ready" : "missing"}
            />
          </div>
          {props.d1Readiness ? (
            props.d1Readiness.ok ? (
              <p className="text-muted-foreground">
                Required tables are present.
              </p>
            ) : (
              <div className="flex flex-col gap-2 text-muted-foreground">
                <p>
                  Missing tables: {props.d1Readiness.missingTables.join(", ")}
                </p>
                <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                  {props.d1Readiness.migrationCommand}
                </code>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">
              D1 readiness check unavailable.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
