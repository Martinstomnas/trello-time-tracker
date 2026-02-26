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
    green: "#61BD4F",
    yellow: "#F2D600",
    orange: "#FF9F1A",
    red: "#EB5A46",
    purple: "#C377E0",
    blue: "#0079BF",
    sky: "#00C2E0",
    lime: "#51E898",
    pink: "#FF78CB",
    black: "#344563",
    gray: "#B3BAC5",
  };
  return map[color] || "#B3BAC5";
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
