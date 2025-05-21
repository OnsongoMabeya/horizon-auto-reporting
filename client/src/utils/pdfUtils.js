import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// PDF styling constants
const PDF_STYLES = {
  page: {
    format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
    margin: 20
  },
  fonts: {
    title: { size: 24, style: 'bold' },
    subtitle: { size: 18, style: 'bold' },
    heading: { size: 16, style: 'bold' },
    subheading: { size: 14, style: 'normal' },
    body: { size: 12, style: 'normal' }
  },
  colors: {
    primary: '#1976d2',
    secondary: '#666666',
    text: '#000000'
  },
  charts: {
    height: 80,
    spacing: 15
  }
};

// Helper function to add styled text
const addStyledText = (pdf, text, x, y, style, options = {}) => {
  pdf.setFont('helvetica', style.style);
  pdf.setFontSize(style.size);
  pdf.setTextColor(PDF_STYLES.colors.text);
  pdf.text(text, x, y, options);
};

// Helper function to add a chart section
const addChartSection = async (pdf, chartRef, title, x, y, width, height) => {
  if (!chartRef?.current) {
    console.warn(`Chart reference not found for ${title}`);
    return y;
  }

  try {
    // Add section title
    addStyledText(pdf, title, x, y, PDF_STYLES.fonts.subheading);
    
    // Convert chart to image
    const chartImage = chartRef.current.toDataURL('image/png', 1.0);
    
    // Add chart image
    pdf.addImage(
      chartImage,
      'PNG',
      x,
      y + 5,
      width,
      height
    );

    return y + height + PDF_STYLES.charts.spacing;
  } catch (error) {
    console.error(`Error adding chart for ${title}:`, error);
    return y + PDF_STYLES.charts.spacing;
  }
};

// Main PDF generation function
export const generatePDF = async (containerRef, narrations, chartRefs) => {
  try {
    // Initialize PDF
    const pdf = new jsPDF(PDF_STYLES.page.orientation, PDF_STYLES.page.unit, PDF_STYLES.page.format);
    const pageWidth = pdf.internal.pageSize.width;
    const margin = PDF_STYLES.page.margin;
    const contentWidth = pageWidth - (2 * margin);

    // Add title page
    addStyledText(pdf, 'Horizon Auto Report', margin, 30, PDF_STYLES.fonts.title);
    addStyledText(pdf, `Generated on: ${new Date().toLocaleString()}`, margin, 45, PDF_STYLES.fonts.body);
    addStyledText(pdf, 'RF System Analysis', margin, 60, PDF_STYLES.fonts.subtitle);

    // Process each station
    for (const [station, narration] of Object.entries(narrations)) {
      pdf.addPage();
      
      // Station header
      addStyledText(pdf, `Station: ${station}`, margin, 30, PDF_STYLES.fonts.heading);

      let yOffset = 50;
      const metrics = [
        { name: 'Forward Power', label: 'Forward Power Readings' },
        { name: 'Reflected Power', label: 'Reflected Power Readings' },
        { name: 'VSWR', label: 'VSWR Measurements' },
        { name: 'Return Loss', label: 'Return Loss Analysis' },
        { name: 'Temperature', label: 'Temperature Readings' },
        { name: 'Voltage', label: 'Voltage Measurements' },
        { name: 'Current', label: 'Current Readings' },
        { name: 'Power', label: 'Power Analysis' }
      ];

      // Add charts
      for (const metric of metrics) {
        const chartRef = chartRefs[station]?.[metric.name];
        
        // Check if we need a new page
        if (yOffset + PDF_STYLES.charts.height > pdf.internal.pageSize.height - margin) {
          pdf.addPage();
          yOffset = 30;
        }

        yOffset = await addChartSection(
          pdf,
          chartRef,
          metric.label,
          margin,
          yOffset,
          contentWidth,
          PDF_STYLES.charts.height
        );
      }

      // Add analysis
      pdf.addPage();
      addStyledText(pdf, `Analysis Report for ${station}`, margin, 30, PDF_STYLES.fonts.heading);

      // Format narration text
      const narrationText = narration
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\n\s*\n/g, '\n') // Remove extra newlines
        .trim();

      const splitText = pdf.splitTextToSize(narrationText, contentWidth);
      addStyledText(pdf, splitText, margin, 50, PDF_STYLES.fonts.body);
    }

    return pdf;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
};
