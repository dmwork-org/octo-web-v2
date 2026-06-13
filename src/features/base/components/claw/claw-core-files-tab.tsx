import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import {
  getAgentFileContent,
  type AgentCardData,
  type CoreFile,
} from "@/features/base/api/endpoints/agent-card.api";
import { useT } from "@/lib/i18n/use-t";

interface ClawCoreFilesTabProps {
  botId: string;
  /** 父组件已经拉过的 AgentCard,直传避免重复请求(对齐老仓 agentCardData prop)。 */
  agentCardData?: AgentCardData | null;
}

interface FileItem {
  name: string;
  path: string;
  size: string;
}

interface FileGroup {
  label: string;
  files: FileItem[];
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 把 AgentCardData 拆成左侧目录的 FileGroup(对齐老仓
 * `AgentCardService.buildFileGroups`):
 * - 核心文件按 category 分桶(identity / tools / 其他)
 * - 记忆文件单独 group
 */
function buildFileGroups(card: AgentCardData, t: (k: string) => string): FileGroup[] {
  const groups: FileGroup[] = [];
  const identity: CoreFile[] = [];
  const tools: CoreFile[] = [];
  const other: CoreFile[] = [];
  for (const f of card.core_files) {
    if (f.category === "identity") identity.push(f);
    else if (f.category === "tools") tools.push(f);
    else other.push(f);
  }
  const toItem = (f: CoreFile | AgentCardData["memory_files"][number]): FileItem => ({
    name: f.file_name,
    path: f.file_name,
    size: formatBytes(f.file_size),
  });
  if (identity.length) {
    groups.push({ label: t("base.claw.coreFiles.group.identity"), files: identity.map(toItem) });
  }
  if (tools.length) {
    groups.push({ label: t("base.claw.coreFiles.group.tools"), files: tools.map(toItem) });
  }
  if (other.length) {
    groups.push({ label: t("base.claw.coreFiles.group.other"), files: other.map(toItem) });
  }
  if (card.memory_files.length) {
    groups.push({
      label: t("base.claw.coreFiles.group.memory"),
      files: card.memory_files.map(toItem),
    });
  }
  return groups;
}

/**
 * 龙虾核心文件 tab(对齐老仓 `ClawCoreFilesTab` + `FileViewer` 合并):
 * 左目录树 + 右 Markdown 预览。
 *
 * **依赖外部 AgentCardData**:caller(`ClawInfoModal`)已经 useQuery 拿了,
 * 直接传 `agentCardData` 复用,本组件不重复请求。文件内容按 path 独立 query。
 */
export function ClawCoreFilesTab({ botId, agentCardData }: ClawCoreFilesTabProps) {
  const t = useT();
  const groups = agentCardData ? buildFileGroups(agentCardData, t) : [];
  const firstPath = groups[0]?.files[0]?.path ?? "";
  const [activePath, setActivePath] = useState(firstPath);
  // agentCardData 异步到位后把 active 落到第一项
  const initRef = useRef(false);
  useInitActivePath(firstPath, activePath, setActivePath, initRef);

  const { data: fileContent, isLoading } = useQuery({
    queryKey: ["agent-card", "file", botId, activePath],
    queryFn: () => getAgentFileContent(botId, activePath),
    enabled: !!activePath,
    staleTime: 30 * 1000,
  });

  if (!agentCardData) {
    return <EmptyState text={t("base.claw.loading")} />;
  }
  if (groups.length === 0) {
    return <EmptyState text={t("base.claw.coreFiles.empty")} />;
  }

  return (
    <div className="flex h-full overflow-hidden rounded-lg border border-border-default">
      <div className="flex w-[240px] shrink-0 flex-col border-r border-border-default bg-bg-base">
        <div className="border-b border-border-default px-3 py-2 text-[12px] font-medium text-text-tertiary">
          {t("base.fileViewer.sidebarTitle", { values: { count: groups.length } })}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {groups.map((g, gi) => (
            <div key={gi} className="mb-2">
              <div className="px-3 py-1 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">
                {g.label}
              </div>
              {g.files.map((f) => {
                const active = f.path === activePath;
                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setActivePath(f.path)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
                      active
                        ? "bg-[rgba(127,59,245,0.08)] text-text-primary"
                        : "text-text-secondary hover:bg-bg-hover"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-[11px] text-text-tertiary">{f.size}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-bg-surface">
        <div className="flex items-center gap-2 border-b border-border-default px-3 py-2 text-[12px]">
          <FileText className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
            {fileContent?.file_name || activePath || "—"}
          </span>
          <span className="shrink-0 text-text-tertiary">{t("base.fileViewer.readonly")}</span>
          {fileContent ? (
            <span className="shrink-0 text-text-tertiary">
              {formatBytes(fileContent.file_size)} · {fileContent.last_synced_at}
            </span>
          ) : null}
        </div>
        <div className="flex-1 overflow-auto px-4 py-3">
          {isLoading ? (
            <div className="py-6 text-center text-text-tertiary">
              {t("base.fileViewer.loading")}
            </div>
          ) : fileContent ? (
            <Markdown content={fileContent.content} />
          ) : (
            <div className="py-6 text-center text-text-tertiary">
              {t("base.fileViewer.selectFile")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-border-default bg-bg-base py-12 text-text-tertiary">
      {text}
    </div>
  );
}

/** 异步首条文件到位后 set 一次 activePath,后续用户点击驱动。 */
function useInitActivePath(
  firstPath: string,
  activePath: string,
  setActive: (p: string) => void,
  initRef: React.MutableRefObject<boolean>,
) {
  useEffect(() => {
    if (initRef.current) return;
    if (!activePath && firstPath) {
      setActive(firstPath);
      initRef.current = true;
    }
  }, [firstPath, activePath, setActive, initRef]);
}
