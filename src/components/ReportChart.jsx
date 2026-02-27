import React, { useMemo } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { formatDuration } from "../utils/time.js";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
);

// Color palette for chart segments
const PALETTE = [
  "#0079BF",
  "#61BD4F",
  "#EB5A46",
  "#F2D600",
  "#FF9F1A",
  "#C377E0",
  "#00C2E0",
  "#FF78CB",
  "#344563",
  "#51E898",
  "#B04632",
  "#89609E",
  "#CF513D",
  "#4BBF6B",
  "#29CCE5",
];

function trelloLabelColor(color) {
  const map = {
    // Green
    green_light: "#BAF3DB",
    green: "#4BCE97",
    green_dark: "#1F845A",
    // Yellow
    yellow_light: "#F5E989",
    yellow: "#EED12B",
    yellow_dark: "#946F00",
    // Orange
    orange_light: "#FCE4A6",
    orange: "#FCA700",
    orange_dark: "#BD5B00",
    // Red
    red_light: "#FFD5D2",
    red: "#F87168",
    red_dark: "#C9372C",
    // Purple
    purple_light: "#EED7FC",
    purple: "#C97CF4",
    purple_dark: "#964AC0",
    // Blue
    blue_light: "#CFE1FD",
    blue: "#669DF1",
    blue_dark: "#1868DB",
    // Sky (teal i Atlassian)
    sky_light: "#C6EDFB",
    sky: "#6CC3E0",
    sky_dark: "#227D9B",
    // Lime
    lime_light: "#D3F1A7",
    lime: "#94C748",
    lime_dark: "#5B7F24",
    // Pink (magenta i Atlassian)
    pink_light: "#FDD0EC",
    pink: "#E774BB",
    pink_dark: "#AE4787",
    // Black (gray i Atlassian)
    black_light: "#DDDEE1",
    black: "#8C8F97",
    black_dark: "#6B6E76",
  };
  return map[color] || "#8C8F97";
}

/**
 * ReportChart – Renders either a bar or pie chart for aggregated time data.
 *
 * @param {{ data: Array<{ label: string, totalMs: number }>, chartType: 'bar'|'pie' }} props
 */
export default function ReportChart({ data, chartType }) {
  const chartData = useMemo(() => {
    const labels = data.map((d) => d.label);
    const values = data.map((d) => Math.round(d.totalMs / 60000)); // convert to minutes
    const colors = data.map((d, i) =>
      d.color ? trelloLabelColor(d.color) : PALETTE[i % PALETTE.length],
    );

    return {
      labels,
      datasets: [
        {
          label: "Tid (minutter)",
          data: values,
          backgroundColor: colors,
          borderColor: chartType === "bar" ? colors.map((c) => c) : "#fff",
          borderWidth: chartType === "bar" ? 0 : 2,
          borderRadius: chartType === "bar" ? 4 : 0,
        },
      ],
    };
  }, [data, chartType]);

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: chartType === "pie",
        position: "right",
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const ms = data[ctx.dataIndex]?.totalMs || 0;
            return ` ${ctx.label}: ${formatDuration(ms)}`;
          },
        },
      },
    },
  };

  const barOptions = {
    ...commonOptions,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Minutter" },
      },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 0,
        },
      },
    },
  };

  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#5E6C84", padding: 32 }}>
        Ingen data å vise.
      </div>
    );
  }

  return (
    <div style={{ height: 380 }}>
      {chartType === "bar" ? (
        <Bar data={chartData} options={barOptions} />
      ) : (
        <Pie data={chartData} options={commonOptions} />
      )}
    </div>
  );
}
