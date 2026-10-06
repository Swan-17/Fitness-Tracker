"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const demoHr = Array.from({ length: 24 }, (_, i) => ({
  hour: i + ":00",
  bpm: 64 + Math.round(12 * Math.sin(i / 3) + Math.random() * 9),
}));

const sleep = [
  { name: "Deep", hours: 1.35 },
  { name: "REM", hours: 1.75 },
  { name: "Light", hours: 4.2 },
  { name: "Awake", hours: 0.55 },
];

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [liveHr, setLiveHr] = useState<Array<{ hour: string; bpm: number }> | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("oauth_error");
    if (error) setOauthError(error);

    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(async (x) => {
        setConnected(x.connected);
        if (!x.connected) return;

        const r = await fetch("/api/health?type=heart-rate", { cache: "no-store" });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setHealthError(body.error || `Google Health request failed (${r.status})`);
          return;
        }

        const json = await r.json();
        const points = (json.dataPoints || [])
          .map((p: any) => {
            const sample = p.heartRate;
            const time = sample?.sampleTime?.physicalTime ?? sample?.sampleTime?.physical_time;
            return {
              hour: time
                ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "",
              bpm: Number(sample?.beatsPerMinute ?? sample?.beats_per_minute ?? 0),
            };
          })
          .filter((point: { hour: string; bpm: number }) => point.hour && point.bpm > 0);

        if (points.length) setLiveHr(points);
        else setHealthError("Google Health is connected, but no heart-rate samples were returned for the last 24 hours. Make sure your Fitbit has synced recently.");
      })
      .catch(() => {});
  }, []);

  const chartData = liveHr || [];

  return (
    <main>
      <header className="top">
        <div>
          <span className="eyebrow">FITBIT AIR</span>
          <h1>Personal health, without the clutter.</h1>
          <p>One calm dashboard for the signals your wristband collects.</p>
        </div>
        <a className="connect" href="/api/auth/start">
          {connected ? "Reconnect Google Health" : "Connect Google Health"}
        </a>
      </header>

      {oauthError && (
        <section className="panel errorPanel">
          <strong>Google Health connection needs attention</strong>
          <p>{oauthError}</p>
        </section>
      )}

      <section className="grid">
        <Metric label="Resting HR" value="—" unit="bpm" trend={connected ? "Live metric coming next" : "Connect Google Health"} />
        <Metric label="HRV" value="—" unit="ms" trend={connected ? "Live metric coming next" : "Connect Google Health"} />
        <Metric label="Steps" value="—" unit="" trend={connected ? "Live metric coming next" : "Connect Google Health"} />
        <Metric label="Active Zone" value="—" unit="min" trend={connected ? "Live metric coming next" : "Connect Google Health"} />
      </section>

      {healthError && connected && (
        <section className="panel errorPanel">
          <strong>Connected, but no live data yet</strong>
          <p>{healthError}</p>
        </section>
      )}

      <section className="panel wide">
        <div className="panelHead">
          <div><span className="eyebrow">HEART</span><h2>24-hour heart rate</h2></div>
          <span className="pill">{liveHr ? "Live Google Health" : connected ? "Waiting for data" : "Not connected"}</span>
        </div>
        <div className="chart">
          {chartData.length ? <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <XAxis dataKey="hour" />
              <YAxis domain={[45, 150]} />
              <Tooltip />
              <Area type="monotone" dataKey="bpm" stroke="#8b5cf6" fill="#8b5cf633" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer> : <div className="muted" style={{ padding: "3rem 0" }}>No live heart-rate samples to display.</div>}
        </div>
      </section>

      <section className="two">
        <section className="panel">
          <div className="panelHead">
            <div><span className="eyebrow">SLEEP</span><h2>Last night</h2></div>
            <strong className="big">—</strong>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sleep} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" />
              <Tooltip />
              <Bar dataKey="hours" radius={[0, 8, 8, 0]} fill="#60a5fa" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <div className="panelHead">
            <div><span className="eyebrow">RECOVERY</span><h2>Readiness</h2></div>
            <span className="score">—</span>
          </div>
          <p className="muted">Recovery will be calculated from your connected Google Health data once the corresponding daily metrics are loaded.</p>
          <div className="progress"><span style={{ width: "82%" }} /></div>
        </section>
      </section>

      <section className="panel">
        <span className="eyebrow">DATA STREAMS</span>
        <h2>What Air can feed this dashboard</h2>
        <div className="streams">
          {["Heart rate", "HRV", "SpO₂", "Respiratory rate", "Sleep", "Steps", "Distance", "Calories", "Exercise", "VO₂ Max", "Active Zone Minutes", "Temperature variation"].map((x) => <span key={x}>{x}</span>)}
        </div>
      </section>

      <footer>{connected && liveHr ? "Live Google Health heart-rate data is connected." : connected ? "Google Health is connected; waiting for synced health data." : "Connect Google Health to load your personal data."}</footer>
    </main>
  );
}

function Metric({ label, value, unit, trend }: { label: string; value: string; unit: string; trend: string }) {
  return <div className="metric"><span className="eyebrow">{label}</span><div className="metricValue">{value}<small>{unit}</small></div><span className="muted">{trend}</span></div>;
}
