import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type AdminMemory } from "@personal-agent/shared";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  loadMemories,
  createMemory,
  updateMemory,
  deleteMemory
} from "@/lib/api";
import { formatDateTime, truncateText } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { EmptyState, filterText, useAsyncData, Field } from "./resource-common";
import { EditIcon, PlusIcon, TrashIcon } from "lucide-react";

export function DataPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const memories = useAsyncData(() => loadMemories(), []);

  // Create state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createContent, setCreateContent] = useState("");

  // Edit state
  const [editingMemory, setEditingMemory] = useState<AdminMemory | null>(null);
  const [editContent, setEditContent] = useState("");

  // Delete state
  const [deletingMemory, setDeletingMemory] = useState<AdminMemory | null>(null);

  const reload = () => {
    memories.setData(null);
    void loadMemories()
      .then((data) => memories.setData(data))
      .catch((err) => toast.error(err instanceof Error ? err.message : "刷新失败"));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createContent.trim()) {
      toast.error("内容不能为空");
      return;
    }
    try {
      await createMemory(createContent);
      toast.success("新建成功");
      setIsCreateOpen(false);
      setCreateContent("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新建失败");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemory) return;
    if (!editContent.trim()) {
      toast.error("内容不能为空");
      return;
    }
    try {
      await updateMemory(editingMemory.id, editContent);
      toast.success("更新成功");
      setEditingMemory(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDelete = async () => {
    if (!deletingMemory) return;
    try {
      await deleteMemory(deletingMemory.id);
      toast.success("删除成功");
      setDeletingMemory(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleOpenEdit = (memory: AdminMemory) => {
    setEditingMemory(memory);
    setEditContent(memory.content);
  };

  const filteredItems = useMemo(() => {
    const items = memories.data?.items ?? [];
    return items.filter(
      (memory) =>
        (status === "all" || memory.status === status) &&
        filterText(memory.content, String(memory.id)).includes(query.toLowerCase())
    );
  }, [memories.data, query, status]);

  return (
    <>
      <PageHeader
        description="管理日志类型的记忆数据。可以手动添加、修改或删除记忆事件。"
        title="Memories"
        actions={
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 cursor-pointer">
            <PlusIcon size={16} />
            添加记忆
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Log Memories</CardTitle>
              <CardDescription>支持内容检索和状态过滤。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索记忆内容"
                value={query}
              />
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {memories.loading ? (
            <Skeleton className="h-64 w-full" />
          ) : filteredItems.length === 0 ? (
            <EmptyState>暂无符合条件的记忆。</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((memory) => (
                  <TableRow key={memory.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">{memory.id}</TableCell>
                    <TableCell>{truncateText(memory.content, 120)}</TableCell>
                    <TableCell>
                      <StatusBadge status={memory.status} />
                    </TableCell>
                    <TableCell>{formatDateTime(memory.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleOpenEdit(memory)}
                          className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                          disabled={memory.status === "deleted"}
                        >
                          <EditIcon size={14} />
                          <span className="sr-only">编辑</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeletingMemory(memory)}
                          className="h-8 w-8 cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-500/5"
                          disabled={memory.status === "deleted"}
                        >
                          <TrashIcon size={14} />
                          <span className="sr-only">删除</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Creation Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md bg-card border-none shadow-xl">
          <form onSubmit={(e) => void handleCreate(e)}>
            <DialogHeader>
              <DialogTitle>新建日志记忆</DialogTitle>
              <DialogDescription>
                手动为系统添加一条日志记忆，以便于后续检索。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Field label="记忆内容">
                <Textarea
                  required
                  placeholder="例如：我喜欢吃辣的食物。"
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  className="min-h-[100px]"
                />
              </Field>
            </div>
            <DialogFooter showCloseButton>
              <Button type="submit" className="cursor-pointer">保存记忆</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingMemory} onOpenChange={(open) => !open && setEditingMemory(null)}>
        <DialogContent className="sm:max-w-md bg-card border-none shadow-xl">
          <form onSubmit={(e) => void handleUpdate(e)}>
            <DialogHeader>
              <DialogTitle>编辑记忆 #{editingMemory?.id}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Field label="记忆内容">
                <Textarea
                  required
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[100px]"
                />
              </Field>
            </div>
            <DialogFooter showCloseButton>
              <Button type="submit" className="cursor-pointer">保存修改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deletingMemory} onOpenChange={(open) => !open && setDeletingMemory(null)}>
        <AlertDialogContent className="border-none bg-card shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除该记忆吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除该日志记忆（设为 deleted 状态），且不可逆。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-red-500 text-white hover:bg-red-600 cursor-pointer"
            >
              确定删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
