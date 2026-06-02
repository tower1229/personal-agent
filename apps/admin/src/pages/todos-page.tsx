import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type AdminTodo,
  type TodoStatus
} from "@personal-agent/shared";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  loadTodos,
  createTodo,
  updateTodo,
  deleteTodo
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
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
import {
  EmptyState,
  Field,
  filterText,
  useAsyncData
} from "./resource-common";
import { CalendarIcon, EditIcon, PlusIcon, TrashIcon } from "lucide-react";

// Datetime helper conversion
const toLocalDateTimeString = (timestamp: number | null): string => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalDateTimeString = (val: string): number | null => {
  if (!val) return null;
  const parsed = new Date(val).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

// Relative/overdue time highlighting
const getDueTimeStatus = (dueAt: number | null, status: TodoStatus) => {
  if (!dueAt) return { text: "-", className: "text-muted-foreground" };
  if (status === "completed") {
    return { text: formatDateTime(dueAt), className: "text-muted-foreground line-through" };
  }
  const now = Date.now();
  const diff = dueAt - now;
  const absDiff = Math.abs(diff);
  const minutes = Math.floor(absDiff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let diffText = "";
  if (days > 0) diffText = `${days}天`;
  else if (hours > 0) diffText = `${hours}小时`;
  else diffText = `${minutes}分钟`;

  if (diff < 0) {
    return {
      text: `已逾期 ${diffText} (${formatDateTime(dueAt)})`,
      className: "text-red-500 font-medium bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10 text-xs"
    };
  } else if (diff < 15 * 60 * 1000) {
    return {
      text: `即将到期 (${diffText}内: ${formatDateTime(dueAt)})`,
      className: "text-amber-500 font-medium bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 text-xs animate-pulse"
    };
  } else {
    return {
      text: `${diffText}后 (${formatDateTime(dueAt)})`,
      className: "text-foreground text-xs"
    };
  }
};

export function TodosPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  // Load and manage todos data async
  const todos = useAsyncData(() => loadTodos(), []);

  // Creation state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDue, setCreateDue] = useState("");

  // Edit state
  const [editingTodo, setEditingTodo] = useState<AdminTodo | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<TodoStatus>("open");
  const [editDue, setEditDue] = useState("");

  // Delete state
  const [deletingTodo, setDeletingTodo] = useState<AdminTodo | null>(null);

  // Trigger reload helper
  const reload = () => {
    todos.setData(null);
    void loadTodos()
      .then((data) => todos.setData(data))
      .catch((err) => toast.error(err instanceof Error ? err.message : "刷新失败"));
  };

  // Actions handlers
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      toast.error("待办标题不能为空");
      return;
    }
    try {
      const dueTimestamp = fromLocalDateTimeString(createDue);
      await createTodo(createTitle, dueTimestamp);
      toast.success("新建待办成功");
      setIsCreateOpen(false);
      setCreateTitle("");
      setCreateDue("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新建待办失败");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTodo) return;
    if (!editTitle.trim()) {
      toast.error("待办标题不能为空");
      return;
    }
    try {
      const dueTimestamp = fromLocalDateTimeString(editDue);
      await updateTodo(editingTodo.id, editTitle, editStatus, dueTimestamp);
      toast.success("更新待办成功");
      setEditingTodo(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新待办失败");
    }
  };

  const handleDelete = async () => {
    if (!deletingTodo) return;
    try {
      await deleteTodo(deletingTodo.id);
      toast.success("删除待办成功");
      setDeletingTodo(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除待办失败");
    }
  };

  const handleQuickToggleComplete = async (todo: AdminTodo) => {
    try {
      const nextStatus: TodoStatus = todo.status === "open" ? "completed" : "open";
      await updateTodo(todo.id, todo.title, nextStatus, todo.dueAt);
      toast.success(nextStatus === "completed" ? "已标记为完成" : "已重新打开待办");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleOpenEdit = (todo: AdminTodo) => {
    setEditingTodo(todo);
    setEditTitle(todo.title);
    setEditStatus(todo.status);
    setEditDue(toLocalDateTimeString(todo.dueAt));
  };

  // Filtered lists
  const filteredItems = useMemo(() => {
    const items = todos.data?.items ?? [];
    return items.filter(
      (todo) =>
        (status === "all" || todo.status === status) &&
        filterText(todo.title, String(todo.id)).includes(query.toLowerCase())
    );
  }, [todos.data, query, status]);

  return (
    <>
      <PageHeader
        description="管理您的待办提醒事项。在此进行创建、编辑、归档或设定具体的提醒时间。"
        title="Todos"
        actions={
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 cursor-pointer">
            <PlusIcon size={16} />
            新建待办
          </Button>
        }
      />

      <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>待办列表</CardTitle>
              <CardDescription>管理未完成及历史待办，到期前将自动发送 Telegram 提醒。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索待办任务..."
                value={query}
              />
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="open">未完成 (Open)</SelectItem>
                    <SelectItem value="completed">已完成 (Completed)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {todos.loading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : filteredItems.length === 0 ? (
            <EmptyState>暂无符合条件的待办事项。</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>任务内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>到期时间</TableHead>
                  <TableHead>已提醒</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((todo) => {
                  const dueInfo = getDueTimeStatus(todo.dueAt, todo.status);
                  return (
                    <TableRow key={todo.id} className="hover:bg-muted/30 transition-colors group">
                      <TableCell>
                        <Checkbox
                          checked={todo.status === "completed"}
                          onCheckedChange={() => void handleQuickToggleComplete(todo)}
                          className="cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{todo.id}
                      </TableCell>
                      <TableCell className={`font-medium ${todo.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {todo.title}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={todo.status} />
                      </TableCell>
                      <TableCell className={dueInfo.className}>
                        {dueInfo.text}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {todo.remindedAt ? formatDateTime(todo.remindedAt) : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(todo.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenEdit(todo)}
                            className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <EditIcon size={14} />
                            <span className="sr-only">编辑</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeletingTodo(todo)}
                            className="h-8 w-8 cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-500/5"
                          >
                            <TrashIcon size={14} />
                            <span className="sr-only">删除</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              <DialogTitle>新建待办事项</DialogTitle>
              <DialogDescription>
                快速在系统中增加一条任务，如果配置了到期时间，会开启主动提醒。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Field label="任务标题" description="简述需要完成的事项。">
                <Input
                  required
                  placeholder="例如：准备明天上午十点的汇报材料"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                />
              </Field>
              <Field label="到期提醒时间 (可选)" description="设定的时间到达前 15 分钟将自动发送通知。">
                <div className="relative">
                  <Input
                    type="datetime-local"
                    value={createDue}
                    onChange={(e) => setCreateDue(e.target.value)}
                    className="pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:z-10"
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-0" />
                </div>
              </Field>
            </div>
            <DialogFooter showCloseButton>
              <Button type="submit" className="cursor-pointer">创建待办</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTodo} onOpenChange={(open) => !open && setEditingTodo(null)}>
        <DialogContent className="sm:max-w-md bg-card border-none shadow-xl">
          <form onSubmit={(e) => void handleUpdate(e)}>
            <DialogHeader>
              <DialogTitle>编辑待办 #{editingTodo?.id}</DialogTitle>
              <DialogDescription>
                修改待办事项的标题、状态或设定新的到期提醒时间。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Field label="任务标题">
                <Input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </Field>
              <Field label="状态">
                <Select onValueChange={(val) => setEditStatus(val as TodoStatus)} value={editStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">未完成 (Open)</SelectItem>
                    <SelectItem value="completed">已完成 (Completed)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="到期提醒时间 (可选)" description="更改时间后，若该时间在未来，原有的提醒触达标记将被重置，到期时能再次接收提醒。">
                <div className="relative">
                  <Input
                    type="datetime-local"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:z-10"
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-0" />
                </div>
              </Field>
            </div>
            <DialogFooter showCloseButton>
              <Button type="submit" className="cursor-pointer">保存修改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deletingTodo} onOpenChange={(open) => !open && setDeletingTodo(null)}>
        <AlertDialogContent className="border-none bg-card shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除该待办吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将物理删除待办事项 #{deletingTodo?.id}（“{deletingTodo?.title}”）。此删除操作是不可逆的。
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
