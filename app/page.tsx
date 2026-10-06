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

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("oauth_error");
    if (error) setOauthError(error);

    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(async (x) => {
        setConnected(x.connected);
        if (!x.connected) return;

        const r = await fetch("/api/health?type=heart-rate");
        if (!r.ok) return;

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
      })
      .catch(() => {});
  }, []);

  const chartData = liveHr || demoHr;

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
        <Metric label="Resting HR" value="58" unit="bpm" trend="−3 vs 30d" />
        <Metric label="HRV" value="52" unit="ms" trend="+8% vs 30d" />
        <Metric label="Steps" value="8,421" unit="" trend="84% of goal" />
        <Metric label="Active Zone" value="42" unit="min" trend="Today" />
      </section>

      <section className="panel wide">
        <div className="panelHead">
          <div><span className="eyebrow">HEART</span><h2>24-hour heart rate</h2></div>
          <span className="pill">{liveHr ? "Live Google Health" : "Demo data"}</span>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <XAxis dataKey="hour" />
              <YAxis domain={[45, 150]} />
              <Tooltip />
              <Area type="monotone" dataKey="bpm" stroke="#8b5cf6" fill="#8b5cf633" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="two">
        <section className="panel">
          <div className="panelHead">
            <div><span className="eyebrow">SLEEP</span><h2>Last night</h2></div>
            <strong className="big">7h 49m</strong>
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
            <span className="score">82</span>
          </div>
          <p className="muted">Strong recovery today. HRV is above your 30-day baseline and sleep duration is on target.</p>
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

      <footer>{connected && liveHr ? "Live Google Health heart-rate data is connected." : "Demo values remain local until Google Health OAuth is connected."}</footer>
    </main>
  );
}

function Metric({ label, value, unit, trend }: { label: string; value: string; unit: string; trend: string }) {
  return <div className="metric"><span className="eyebrow">{label}</span><div className="metricValue">{value}<small>{unit}</small></div><span className="muted">{trend}</span></div>;
}
