import Chart from 'chart.js/auto';

// Default chart configuration
const defaultChartConfig = {
  type: 'line',
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750,
      easing: 'easeInOutQuart'
    },
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleSpacing: 10,
        bodySpacing: 8,
        displayColors: true
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
          drawBorder: false
        },
        ticks: {
          padding: 8,
          maxTicksLimit: 8
        }
      },
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
          drawBorder: false
        },
        ticks: {
          maxTicksLimit: 10,
          maxRotation: 0
        }
      }
    }
  }
};

// Create or update a chart
export const createChart = (ref, title, labels, data, color) => {
  if (!ref || !ref.current) return null;

  // Clear any existing chart
  const existingChart = Chart.getChart(ref.current);
  if (existingChart) {
    existingChart.destroy();
  }

  // Convert color name to rgba
  const colorMap = {
    blue: '54, 162, 235',
    red: '255, 99, 132',
    orange: '255, 159, 64',
    purple: '153, 102, 255',
    green: '75, 192, 192',
    brown: '165, 42, 42'
  };

  const rgbaColor = colorMap[color] || '128, 128, 128';

  const config = {
    ...defaultChartConfig,
    data: {
      labels,
      datasets: [{
        label: title,
        data,
        backgroundColor: `rgba(${rgbaColor}, 0.2)`,
        borderColor: `rgba(${rgbaColor}, 1)`,
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      ...defaultChartConfig.options,
      plugins: {
        ...defaultChartConfig.options.plugins,
        title: {
          display: true,
          text: title,
          padding: 20,
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      }
    }
  };

  return new Chart(ref.current, config);
};

// Calculate trend and insights for a metric
export const getMetricInsights = (timestamps, values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      max: 0,
      min: 0,
      average: 0,
      maxTime: '',
      minTime: '',
      trend: 'No data available',
      changeRate: 0
    };
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const maxIndex = values.indexOf(max);
  const minIndex = values.indexOf(min);

  // Calculate trend
  const recentValues = values.slice(-10); // Last 10 points
  const trend = recentValues.reduce((acc, curr, i) => {
    if (i === 0) return 0;
    return acc + (curr - recentValues[i - 1]);
  }, 0);

  const trendDescription = trend > 0 ? 'Increasing' :
    trend < 0 ? 'Decreasing' : 'Stable';

  // Calculate rate of change
  const changeRate = ((values[values.length - 1] - values[0]) / values[0] * 100).toFixed(2);

  return {
    max: parseFloat(max.toFixed(2)),
    min: parseFloat(min.toFixed(2)),
    average: parseFloat(average.toFixed(2)),
    maxTime: timestamps[maxIndex],
    minTime: timestamps[minIndex],
    trend: trendDescription,
    changeRate: parseFloat(changeRate)
  };
};
