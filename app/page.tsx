"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

type Point = Record<string, any>;

async function getHealth(type: string) {
  const r = await fetch(`/api/health?type=${type}`, { cache: "no-store" });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Google Health request failed (${r.status})`);
  return json.dataPoints || [];
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [liveHr, setLiveHr] = useState<Array<{ hour: string; bpm: number }> | null>(null);
  const [metrics, setMetrics] = useState({
    restingHr: 0,
    hrv: 0,
    steps: 0,
    activeZone: 0,
    sleepHours: 0,
    sleepStages: [] as Array<{ name: string; hours: number }>,
    readiness: 0,
  });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [device, setDevice] = useState<{ batteryLevel?: number; batteryStatus?: string; deviceVersion?: string; lastSyncTime?: string } | null>(null);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("oauth_error");
    if (error) setOauthError(error);

    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(async (x) => {
        setConnected(x.connected);
        if (!x.connected) return;

        const [results, deviceResult] = await Promise.all([
          Promise.allSettled([
            getHealth("heart-rate"),
          getHealth("daily-resting-heart-rate"),
          getHealth("daily-heart-rate-variability"),
          getHealth("steps"),
          getHealth("active-zone-minutes"),
            getHealth("sleep"),
          ]),
          fetch("/api/device", { cache: "no-store" }).then(async (r) => {
            const json = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(json.error || `Device request failed (${r.status})`);
            return json.device;
          }).catch(() => null),
        ]);

        setDevice(deviceResult);

        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => r.reason instanceof Error ? r.reason.message : String(r.reason));
        if (errors.length) setHealthError(errors[0]);

        const [hr, rhr, hrv, steps, zones, sleep] = results.map((r) =>
          r.status === "fulfilled" ? r.value : [],
        );

        const hrPoints = (hr as Point[])
          .map((p) => {
            const sample = p.heartRate;
            const time = sample?.sampleTime?.physicalTime ?? sample?.sampleTime?.physical_time;
            return {
              timeMs: time ? new Date(time).getTime() : 0,
              hour: time
                ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "",
              bpm: num(sample?.beatsPerMinute ?? sample?.beats_per_minute),
            };
          })
          .filter((p) => p.hour && p.bpm > 0);
        hrPoints.sort((a, b) => a.timeMs - b.timeMs);
        const displayPoints = hrPoints.length > 160
          ? hrPoints.filter((_, i) => i % Math.ceil(hrPoints.length / 160) === 0)
          : hrPoints;
        if (displayPoints.length) setLiveHr(displayPoints.map(({ timeMs: _timeMs, ...point }) => point));

        const latestByDate = (points: Point[], field: string) =>
          [...points]
            .sort((a, b) => String(b[field]?.date ?? "").localeCompare(String(a[field]?.date ?? "")))[0]?.[field];

        const rhrValue = latestByDate(rhr as Point[], "dailyRestingHeartRate");
        const hrvValue = latestByDate(hrv as Point[], "dailyHeartRateVariability");

        const totalSteps = (steps as Point[]).reduce(
          (sum, p) => sum + num(p.steps?.count ?? p.steps?.steps ?? p.steps?.value),
          0,
        );

        const totalZone = (zones as Point[]).reduce(
          (sum, p) => sum + num(p.activeZoneMinutes?.activeZoneMinutes ?? p.activeZoneMinutes?.active_zone_minutes),
          0,
        );

        const sleepPoints = sleep as Point[];
        const bestSleep = [...sleepPoints]
          .map((p) => {
            const s = p.sleep;
            const interval = s?.interval;
            const start = interval?.startTime ?? interval?.start_time;
            const end = interval?.endTime ?? interval?.end_time;
            const duration = start && end ? Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3600000) : 0;
            return { s, duration };
          })
          .sort((a, b) => b.duration - a.duration)[0];

        const sleepSummary = bestSleep?.s?.sleepSummary ?? bestSleep?.s?.summary;
        const stageSummaries = sleepSummary?.stageSummaries ?? sleepSummary?.stage_summaries ?? [];
        const stages = (stageSummaries as Point[])
          .map((stage) => ({
            name: String(stage.type ?? "").replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()),
            hours: num(stage.minutes) / 60,
          }))
          .filter((stage) => stage.hours > 0 && stage.name !== "Awake");

        const sleepHours = num(sleepSummary?.totalMinutesAsleep ?? sleepSummary?.total_minutes_asleep) / 60 || bestSleep?.duration || 0;
        const restingHr = num(rhrValue?.beatsPerMinute ?? rhrValue?.beats_per_minute);
        const hrvMs = num(
          hrvValue?.averageHeartRateVariabilityMilliseconds ??
          hrvValue?.average_heart_rate_variability_milliseconds ??
          hrvValue?.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ??
          hrvValue?.deep_sleep_root_mean_square_of_successive_differences_milliseconds,
        );

        const readiness =
          restingHr > 0 && hrvMs > 0 && sleepHours > 0
            ? Math.round(Math.max(0, Math.min(100,
                70 +
                Math.min(15, (sleepHours - 7) * 7) +
                Math.min(10, Math.max(-10, (hrvMs - 40) / 4)) -
                Math.min(12, Math.max(0, restingHr - 55) * 0.8),
              )))
            : 0;

        setMetrics({
          restingHr,
          hrv: hrvMs,
          steps: Math.round(totalSteps),
          activeZone: Math.round(totalZone),
          sleepHours,
          sleepStages: stages,
          readiness,
        });

        if (!hrPoints.length && !errors.length) {
          setHealthError("Google Health is connected, but no heart-rate samples were returned for the last 24 hours. Make sure your Fitbit has synced recently.");
        }
      })
      .catch((error) => setHealthError(error instanceof Error ? error.message : "Unable to load Google Health data."));
  }, []);

  const chartData = liveHr || [];
  const currentHr = chartData.length ? chartData[chartData.length - 1].bpm : 0;
  const batteryLevel = typeof device?.batteryLevel === "number" ? Math.max(0, Math.min(100, device.batteryLevel)) : 0;
  const batteryLabel = batteryLevel ? `${batteryLevel}%` : device?.batteryStatus || "—";
  const hasSleep = metrics.sleepHours > 0;
  const displayHours = Math.floor(metrics.sleepHours);
  const displayMinutes = Math.round((metrics.sleepHours - displayHours) * 60);

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

      <section className="heroMetrics">
        <div className="currentCard">
          <span className="eyebrow">CURRENT HEART RATE</span>
          <div className="currentHr">{currentHr || "—"}<small>bpm</small></div>
          <span className="liveDot"><i />Latest synced reading</span>
        </div>
        <div className="batteryCard">
          <span className="eyebrow">WRISTBAND</span>
          <div className="batteryRow"><strong>{batteryLabel}</strong><span className="batteryIcon"><i style={{ width: `${batteryLevel}%` }} /></span></div>
          <span className="muted">{device?.deviceVersion || "Device status"}{device?.lastSyncTime ? ` · synced ${new Date(device.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        </div>
      </section>

      <section className="grid">
        <Metric label="Resting HR" value={metrics.restingHr ? String(metrics.restingHr) : "—"} unit="bpm" trend={metrics.restingHr ? "Live Google Health" : connected ? "Waiting for data" : "Connect Google Health"} />
        <Metric label="HRV" value={metrics.hrv ? String(Math.round(metrics.hrv)) : "—"} unit="ms" trend={metrics.hrv ? "Live Google Health" : connected ? "Waiting for data" : "Connect Google Health"} />
        <Metric label="Steps" value={metrics.steps ? metrics.steps.toLocaleString() : "—"} unit="" trend={metrics.steps ? "Last 24 hours" : connected ? "Waiting for data" : "Connect Google Health"} />
        <Metric label="Active Zone" value={metrics.activeZone ? String(metrics.activeZone) : "—"} unit="min" trend={metrics.activeZone ? "Last 24 hours" : connected ? "Waiting for data" : "Connect Google Health"} />
      </section>

      {healthError && connected && (
        <section className="panel errorPanel">
          <strong>Some Google Health data needs attention</strong>
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
              <XAxis dataKey="hour" interval="preserveStartEnd" minTickGap={28} />
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
            <strong className="big">{hasSleep ? `${displayHours}h ${displayMinutes}m` : "—"}</strong>
          </div>
          {metrics.sleepStages.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.sleepStages} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" />
                <Tooltip />
                <Bar dataKey="hours" radius={[0, 8, 8, 0]} fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">No sleep-stage summary has synced yet.</p>
          )}
        </section>

        <section className="panel">
          <div className="panelHead">
            <div><span className="eyebrow">RECOVERY</span><h2>Readiness</h2></div>
            <span className="score">{metrics.readiness || "—"}</span>
          </div>
          <p className="muted">
            {metrics.readiness
              ? "A simple dashboard readiness score based on today's connected sleep, HRV and resting heart rate. It is not a medical assessment."
              : "Readiness will appear once sleep, HRV and resting heart rate have synced."}
          </p>
          <div className="progress"><span style={{ width: `${metrics.readiness || 0}%` }} /></div>
        </section>
      </section>

      <section className="panel">
        <span className="eyebrow">DATA STREAMS</span>
        <h2>What Air can feed this dashboard</h2>
        <div className="streams">
          {["Heart rate", "HRV", "SpO₂", "Respiratory rate", "Sleep", "Steps", "Distance", "Calories", "Exercise", "VO₂ Max", "Active Zone Minutes", "Temperature variation"].map((x) => <span key={x}>{x}</span>)}
        </div>
      </section>

      <footer>{connected && liveHr ? "Live Google Health data is connected." : connected ? "Google Health is connected; waiting for synced health data." : "Connect Google Health to load your personal data."}</footer>
    </main>
  );
}

function Metric({ label, value, unit, trend }: { label: string; value: string; unit: string; trend: string }) {
  return <div className="metric"><span className="eyebrow">{label}</span><div className="metricValue">{value}<small>{unit}</small></div><span className="muted">{trend}</span></div>;
}
