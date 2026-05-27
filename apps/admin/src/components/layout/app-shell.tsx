import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ActivityIcon,
  BotIcon,
  BrainIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  DatabaseIcon,
  GaugeIcon,
  ListChecksIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  WrenchIcon,
  type LucideIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/app/auth";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const primaryNav: NavItem[] = [
  { label: "Overview", to: "/admin", icon: GaugeIcon },
  { label: "Runs", to: "/admin/runs", icon: ActivityIcon },
  { label: "Skills", to: "/admin/skills", icon: BotIcon },
  { label: "Long Tasks", to: "/admin/long-tasks", icon: ListChecksIcon },
  { label: "Schedules", to: "/admin/schedules", icon: CalendarClockIcon },
  { label: "Approvals", to: "/admin/approvals", icon: ClipboardCheckIcon }
];

const secondaryNav: NavItem[] = [
  { label: "Data", to: "/admin/data/todos", icon: DatabaseIcon },
  { label: "Personal Model", to: "/admin/personal-model", icon: BrainIcon },
  { label: "Settings", to: "/admin/settings", icon: SettingsIcon }
];

function SidebarLink(props: { item: NavItem }) {
  const location = useLocation();
  const activePrefix =
    props.item.to === "/admin/data/todos" ? "/admin/data" : props.item.to;
  const isActive =
    props.item.to === "/admin"
      ? location.pathname === props.item.to
      : location.pathname.startsWith(activePrefix);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <NavLink end={props.item.to === "/admin"} to={props.item.to}>
          <props.item.icon data-icon="inline-start" />
          <span>{props.item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <WrenchIcon data-icon="inline-start" />
              <span className="truncate font-medium">Personal Agent</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => (
                <SidebarLink item={item} key={item.to} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarLink item={item} key={item.to} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 text-xs text-muted-foreground">workers.dev target</p>
      </SidebarFooter>
    </Sidebar>
  );
}

export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">
          {props.title}
        </h1>
        {props.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.actions ? <div>{props.actions}</div> : null}
    </div>
  );
}

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const user = auth.me?.authenticated ? auth.me.user : null;

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
            <SidebarTrigger>
              <MenuIcon data-icon="inline-start" />
            </SidebarTrigger>
            <Separator className="h-5" orientation="vertical" />
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <StatusBadge status="online" />
              <span className="truncate text-sm text-muted-foreground">
                {location.pathname}
              </span>
            </div>
            {user ? (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.username ? `@${user.username}` : user.id}
              </span>
            ) : null}
            <Button
              onClick={() => void auth.logout()}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOutIcon data-icon="inline-start" />
              退出
            </Button>
          </header>
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
