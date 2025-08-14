import { notyf } from "./utils.js";

const PALETTE = ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"];

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
      labels: {
        font: {
          family: "'Inter', sans-serif",
          size: 13,
        },
        color: "#666",
      },
    },
    tooltip: {
      backgroundColor: "#2c2c2c",
      titleFont: {
        family: "'Inter', sans-serif",
        size: 14,
        weight: "bold",
      },
      bodyFont: {
        family: "'Inter', sans-serif",
        size: 13,
      },
      padding: 10,
      cornerRadius: 5,
      boxPadding: 5,
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
    },
    y: {
      grid: {
        color: "#e5e7eb",
        borderDash: [5, 5],
      },
      ticks: {
        font: {
          family: "'Inter', sans-serif",
          size: 12,
        },
        color: "#888",
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
  const topMediaCtx = document.getElementById("topMediaChart")?.getContext("2d");
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
        const gradient = playsOverTimeCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, "rgba(42, 157, 143, 0.6)");
        gradient.addColorStop(1, "rgba(42, 157, 143, 0.1)");

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
                borderColor: "#2a9d8f",
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: "#2a9d8f",
                pointRadius: 4,
                pointHoverRadius: 6,
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
                backgroundColor: PALETTE.map((color) => `${color}B3`),
                borderColor: PALETTE,
                borderWidth: 1,
                borderRadius: 5,
              },
            ],
          },
          {
            ...commonChartOptions,
            indexAxis: "y",
            plugins: {
              ...commonChartOptions.plugins,
              legend: { display: false },
            },
            scales: {
              ...commonChartOptions.scales,
              x: {
                ...commonChartOptions.scales.x,
                grid: { display: true, color: "#e5e7eb", borderDash: [5, 5] },
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
          "doughnut",
          {
            labels: topCampaignsLabels,
            datasets: [
              {
                label: "Exibições",
                data: topCampaignsData,
                backgroundColor: PALETTE,
                hoverOffset: 4,
                borderWidth: 0,
              },
            ],
          },
          {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
                labels: {
                  font: {
                    family: "'Inter', sans-serif",
                    size: 13,
                  },
                  color: "#666",
                },
              },
            },
          }
        );
      } else {
        showNoDataMessage("topCampaignsChart");
      }
    })
    .catch((err) => {
      notyf.error(err.message);
      showNoDataMessage("playsOverTimeChart");
      showNoDataMessage("topMediaChart");
      showNoDataMessage("topCampaignsChart");
    });
}