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
          value="24"
          description="3 running now"
          icon={<Play className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Reviews"
          value="7"
          description="2 high priority"
          icon={<ClipboardCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Test Health"
          value="94%"
          description="Up 2% from last week"
          icon={<HeartPulse className="h-5 w-5" />}
        />
        <StatCard
          title="Failure Triage Queue"
          value="12"
          description="5 new since yesterday"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Placeholder panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent execution runs */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-card-foreground">Recent Execution Runs</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest test suite executions across all projects.
          </p>
          <div className="mt-4 space-y-3">
            {[
              { name: 'auth-flow-suite', status: 'passed', time: '2m ago' },
              { name: 'checkout-regression', status: 'failed', time: '8m ago' },
              { name: 'api-contract-tests', status: 'running', time: '12m ago' },
              { name: 'onboarding-e2e', status: 'passed', time: '25m ago' },
            ].map((run) => (
              <div
                key={run.name}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-card-foreground">{run.name}</p>
                  <p className="text-xs text-muted-foreground">{run.time}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    run.status === 'passed'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : run.status === 'failed'
                        ? 'bg-red-500/10 text-red-600'
                        : 'bg-amber-500/10 text-amber-600'
                  }`}
                >
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Failure triage queue */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-card-foreground">Failure Triage Queue</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Failures awaiting classification and assignment.
          </p>
          <div className="mt-4 space-y-3">
            {[
              { name: 'login-timeout', priority: 'high', age: '1h' },
              { name: 'payment-500', priority: 'high', age: '2h' },
              { name: 'search-flake', priority: 'medium', age: '4h' },
              { name: 'nav-render-shift', priority: 'low', age: '1d' },
            ].map((issue) => (
              <div
                key={issue.name}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-card-foreground">{issue.name}</p>
                  <p className="text-xs text-muted-foreground">Open for {issue.age}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    issue.priority === 'high'
                      ? 'bg-red-500/10 text-red-600'
                      : issue.priority === 'medium'
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-slate-500/10 text-slate-600'
                  }`}
                >
                  {issue.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
