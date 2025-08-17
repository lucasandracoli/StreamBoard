import { showError } from "./notification.js";

const PALETTE = ["#00c86f", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

const setupChart = (ctx, type, data, options) => {
  return new Chart(ctx, { type, data, options });
};

const showNoDataMessage = (canvasId) => {
  const canvas = document.getElementById(canvasId);
  const container = canvas ? canvas.closest(".chart-container") : null;
  if (container) {
    container.innerHTML = `<div class="chart-no-data">
      <div class="chart-no-data-icon">
        <i class="bi bi-bar-chart-line"></i>
      </div>
      <p class="chart-no-data-title">Nenhum dado para exibir</p>
      <p class="chart-no-data-subtitle">As exibições de mídia aparecerão aqui assim que forem registradas.</p>
    </div>`;
  }
};

const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      enabled: true,
      backgroundColor: "var(--color-gray-dark)",
      titleColor: "white",
      bodyColor: "white",
      borderColor: "var(--color-border)",
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
      caretSize: 6,
      bodyFont: {
        size: 13,
        family: "'Inter', sans-serif",
      },
      titleFont: {
        size: 14,
        family: "'Inter', sans-serif",
        weight: "bold",
      },
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        font: {
          family: "'Inter', sans-serif",
          size: 12,
        },
        color: "#888",
      },
      border: {
        display: false,
      },
    },
    y: {
      grid: {
        color: "#f1f5f9",
      },
      ticks: {
        font: {
          family: "'Inter', sans-serif",
          size: 12,
        },
        color: "#888",
        maxTicksLimit: 6,
      },
      border: {
        display: false,
      },
      beginAtZero: true,
    },
  },
};

export function setupDashboardCharts() {
  const page = document.getElementById("dashboard-page");
  if (!page) return;

  const playsOverTimeCtx = document
    .getElementById("playsOverTimeChart")
    ?.getContext("2d");
  const topMediaCtx = document
    .getElementById("topMediaChart")
    ?.getContext("2d");
  const topCampaignsCtx = document
    .getElementById("topCampaignsChart")
    ?.getContext("2d");

  if (!playsOverTimeCtx || !topMediaCtx || !topCampaignsCtx) return;

  fetch("/api/reports/data")
    .then((res) => {
      if (!res.ok) throw new Error("Falha ao buscar dados do relatório.");
      return res.json();
    })
    .then((data) => {
      const { DateTime } = luxon;

      if (data.playsOverTime && data.playsOverTime.length > 0) {
        const playsOverTimeLabels = data.playsOverTime.map((d) =>
          DateTime.fromISO(d.play_date).toFormat("dd/MM")
        );
        const playsOverTimeData = data.playsOverTime.map((d) => d.play_count);

        const primaryColor = PALETTE[0];
        const hexToRgba = (hex, alpha) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const gradient = playsOverTimeCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgba(primaryColor, 0.5));
        gradient.addColorStop(1, hexToRgba(primaryColor, 0.05));

        setupChart(
          playsOverTimeCtx,
          "line",
          {
            labels: playsOverTimeLabels,
            datasets: [
              {
                label: "Exibições por Dia",
                data: playsOverTimeData,
                backgroundColor: gradient,
                borderColor: primaryColor,
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: primaryColor,
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointHoverBorderWidth: 2,
              },
            ],
          },
          commonChartOptions
        );
      } else {
        showNoDataMessage("playsOverTimeChart");
      }

      if (data.topMedia && data.topMedia.length > 0) {
        const topMediaLabels = data.topMedia.map((m) =>
          m.file_name.length > 25
            ? `${m.file_name.substring(0, 22)}...`
            : m.file_name
        );
        const topMediaData = data.topMedia.map((m) => m.play_count);

        setupChart(
          topMediaCtx,
          "bar",
          {
            labels: topMediaLabels,
            datasets: [
              {
                label: "Total de Exibições",
                data: topMediaData,
                backgroundColor: PALETTE.map((color) => `${color}E6`),
                borderWidth: 0,
                borderRadius: 6,
                barPercentage: 0.6,
              },
            ],
          },
          {
            ...commonChartOptions,
            indexAxis: "y",
            scales: {
              ...commonChartOptions.scales,
              x: {
                ...commonChartOptions.scales.x,
                grid: { display: true, color: "#f1f5f9" },
              },
              y: { ...commonChartOptions.scales.y, grid: { display: false } },
            },
          }
        );
      } else {
        showNoDataMessage("topMediaChart");
      }

      if (data.topCampaigns && data.topCampaigns.length > 0) {
        const topCampaignsLabels = data.topCampaigns.map(
          (c) => c.campaign_name
        );
        const topCampaignsData = data.topCampaigns.map((c) => c.play_count);

        setupChart(
          topCampaignsCtx,
          "bar",
          {
            labels: topCampaignsLabels,
            datasets: [
              {
                label: "Exibições",
                data: topCampaignsData,
                backgroundColor: PALETTE.map((color) => `${color}E6`),
                borderWidth: 0,
                borderRadius: 6,
                barPercentage: 0.6,
              },
            ],
          },
          {
            ...commonChartOptions,
            scales: {
              ...commonChartOptions.scales,
              y: {
                ...commonChartOptions.scales.y,
                grid: { display: false },
              },
              x: {
                ...commonChartOptions.scales.x,
                grid: { display: true, color: "#f1f5f9" },
              },
            },
          }
        );
      } else {
        showNoDataMessage("topCampaignsChart");
      }
    })
    .catch((err) => {
      showError(err.message);
      showNoDataMessage("playsOverTimeChart");
      showNoDataMessage("topMediaChart");
      showNoDataMessage("topCampaignsChart");
    });
}
