import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { underwrite, buildReport } from '@dirtbid/underwriting';
import { ReportView } from '@/components/Report';

describe('ReportView', () => {
  it('renders gauges, callouts, sections and scenarios from an engine result', () => {
    const result = underwrite({ marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 12000, zoningCode: 'R-10', projectType: 'vacant_land', arvPerSf: 290, address: '12 Example Ln, Hampton, VA 23666', site: { floodZone: 'X', rpaBuffer: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } });
    const report = buildReport(result, 'enhanced');
    render(<ReportView report={report} result={result} />);
    expect(screen.getByText(/Approval probability/i)).toBeInTheDocument();
    expect(screen.getByText('Zoning & Density')).toBeInTheDocument();
    expect(screen.getByText('Comp Sales')).toBeInTheDocument();
    expect(screen.getAllByText(/Max offer/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText(/Sensitivity/)).toBeInTheDocument();
  });
});
