import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export const generatePDF = async (containerRef, narrations, chartRefs) => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);

    // Add title page
    pdf.setFontSize(24);
    pdf.text('Horizon Auto Report', margin, 30, { align: 'left' });
    pdf.setFontSize(12);
    pdf.text(`Generated on: ${new Date().toLocaleString()}`, margin, 45);

    // Process each station
    for (const [baseStation, stationNarration] of Object.entries(narrations)) {
      pdf.addPage();
      
      // Station header
      pdf.setFontSize(20);
      pdf.text(baseStation, margin, 30);
      pdf.setFontSize(12);

      let yOffset = 50;
      const chartHeight = 80; // height in mm

      // Process each chart type
      for (const chartType of ['Voltage', 'Current', 'Power']) {
        // Add chart label
        pdf.setFontSize(14);
        pdf.text(`${chartType} Readings`, margin, yOffset);
        pdf.setFontSize(12);
        
        // Get chart canvas and convert to image
        const chartCanvas = chartRefs[baseStation][chartType].current;
        const chartImage = chartCanvas.toDataURL('image/png', 1.0);

        // Add chart image
        pdf.addImage(
          chartImage,
          'PNG',
          margin,
          yOffset + 5,
          contentWidth,
          chartHeight
        );

        yOffset += chartHeight + 20;

        // Add new page if next chart won't fit
        if (yOffset + chartHeight > pageHeight - margin && chartType !== 'Power') {
          pdf.addPage();
          yOffset = 30;
        }
      }

      // Add analysis on new page
      pdf.addPage();
      pdf.setFontSize(16);
      pdf.text(`Analysis for ${baseStation}`, margin, 30);
      pdf.setFontSize(12);

      // Format and add narration
      const narrationText = stationNarration.replace(/<[^>]*>/g, '');
      const splitText = pdf.splitTextToSize(narrationText, contentWidth);
      pdf.text(splitText, margin, 50);
    };

    return pdf;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
