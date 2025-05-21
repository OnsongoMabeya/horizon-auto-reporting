import Chart from 'chart.js/auto';

export const createChart = (ref, labels, data, metricLabel, color) => {
  if (!ref.current) return null;

  // Clear any existing chart
  const existingChart = Chart.getChart(ref.current);
  if (existingChart) {
    existingChart.destroy();
  }

  const chart = new Chart(ref.current, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metricLabel,
        data,
        backgroundColor: `rgba(${color}, 0.2)`,
        borderColor: `rgba(${color}, 1)`,
        borderWidth: 1,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: metricLabel
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    }
  });

  return chart;
};

export const getMetricInsights = (values, labels) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const maxIndex = values.indexOf(max);
  const minIndex = values.indexOf(min);

  return {
    max,
    min,
    avg: avg.toFixed(2),
    maxTime: labels[maxIndex],
    minTime: labels[minIndex]
  };
};
