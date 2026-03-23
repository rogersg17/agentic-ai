import { Play, ClipboardCheck, HeartPulse, AlertTriangle } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function StatCard({ title, value, description, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <p className="mt-2 text-3xl font-bold text-card-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your agentic testing pipeline.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Recent Execution Runs"
          value="—"
          description="No data yet"
          icon={<Play className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Reviews"
          value="—"
          description="No data yet"
          icon={<ClipboardCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Test Health"
          value="—"
          description="No data yet"
          icon={<HeartPulse className="h-5 w-5" />}
        />
        <StatCard
          title="Failure Triage Queue"
          value="—"
          description="No data yet"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent execution runs */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-card-foreground">Recent Execution Runs</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest test suite executions across all projects.
          </p>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            No execution runs yet.
          </p>
        </div>

        {/* Failure triage queue */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-card-foreground">Failure Triage Queue</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Failures awaiting classification and assignment.
          </p>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            No failures in the queue.
          </p>
        </div>
      </div>
    </div>
  );
}
