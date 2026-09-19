"use client";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { State, addDays, stats, streaks } from "@/lib/habitpilot/core";
export default function AnalyticsView({
  s,
  today,
  setDetail,
  setEntryDate,
}: {
  s: State;
  today: string;
  setDetail: (id: string) => void;
  setEntryDate: (date: string) => void;
}) {
  const [period, setPeriod] = useState("week");
  const range = period === "week" ? 7 : 30;
  const analytics = stats(s, addDays(today, -range), addDays(today, -1));
  return (
    <>
      <div className="section-heading">
        <h2>Your consistency</h2>
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="week">7 days</TabsTrigger>
            <TabsTrigger value="month">30 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="summary-grid">
        <div className="card">
          <span className="card-label">Completion rate</span>
          <p className="metric">
            {analytics.rate ?? "—"}
            <span>{analytics.rate === null ? "" : "%"}</span>
          </p>
          <p className="small-muted">
            Completed ÷ eligible scheduled occurrences
          </p>
        </div>
        <div className="card">
          <span className="card-label">Completed</span>
          <p className="metric">
            {analytics.completed}
            <span> / {analytics.scheduled}</span>
          </p>
          <p className="small-muted">Last {range} full days; today excluded</p>
        </div>
        <div className="card">
          <span className="card-label">Best streak</span>
          <p className="metric">
            {Math.max(0, ...s.habits.map((h) => streaks(s, h, today).best))}
          </p>
          <p className="small-muted">
            Scheduled occurrences, not calendar days
          </p>
        </div>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>Showing up, over time</h2>
          <span className="small-muted">
            {analytics.series[0]?.date} — {addDays(today, -1)}
          </span>
        </div>
        {analytics.scheduled < 3 ? (
          <div className="empty-state">
            <TrendingUp />
            <h3>A little more history will help.</h3>
            <p>
              At least three scheduled occurrences are needed for a useful
              trend.
            </p>
          </div>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={analytics.series}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}
                />
                <Bar
                  name="Scheduled"
                  dataKey="scheduled"
                  fill="var(--chart-muted)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  name="Completed"
                  dataKey="completed"
                  fill="#159b73"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="small-muted chart-key">
              <span />
              Completed <span />
              Scheduled
            </p>
          </div>
        )}
      </section>
      <section className="card per-habit">
        <h2>One habit at a time</h2>
        {s.habits.map((h) => {
          const a = stats(s, addDays(today, -range), addDays(today, -1), [
            h.id,
          ]);
          return (
            <button
              key={h.id}
              onClick={() => {
                setEntryDate(today);
                setDetail(h.id);
              }}
            >
              <div>
                <strong>{h.name}</strong>
                <span>
                  {a.completed} of {a.scheduled} scheduled
                </span>
              </div>
              <Progress value={a.rate || 0} />
              <strong>{a.rate === null ? "—" : a.rate + "%"}</strong>
              <ChevronRight size={16} />
            </button>
          );
        })}
        <p className="metric-explanation">
          Only active, scheduled dates on or after the start date count. Paused
          and archived periods are excluded. Past schedule versions and quantity
          targets are preserved.
        </p>
      </section>
    </>
  );
}
