import { lazy, Suspense } from 'react';
import { createBrowserRouter, createHashRouter, ScrollRestoration, Outlet } from 'react-router';
import { IS_DEMO } from '@/lib/demo';
import { Spinner } from '@/components/ui';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/Home';
import { FeasibilityPage } from '@/pages/Feasibility';
import { PricingPage } from '@/pages/Pricing';
import { CalculatorPage } from '@/pages/Calculator';
import { HomebuilderPage } from '@/pages/Homebuilder';
import { BuildersPage } from '@/pages/Builders';
import { GetStartedPage } from '@/pages/GetStarted';
import { AIPage } from '@/pages/AI';
import { LoginPage, VerifyPage } from '@/pages/Auth';
import { NotFoundPage } from '@/pages/NotFound';

const PortalLayout = lazy(() => import('@/app/PortalLayout').then((m) => ({ default: m.PortalLayout })));
const DashboardPage = lazy(() => import('@/app/Dashboard').then((m) => ({ default: m.DashboardPage })));
const AssistantPage = lazy(() => import('@/app/Assistant').then((m) => ({ default: m.AssistantPage })));
const LeadsPage = lazy(() => import('@/app/Leads').then((m) => ({ default: m.LeadsPage })));
const SavedRunPage = lazy(() => import('@/app/SavedRun').then((m) => ({ default: m.SavedRunPage })));
const PD = () => import('@/app/ProjectDetail');
const ProjectLayout = lazy(() => PD().then((m) => ({ default: m.ProjectLayout })));
const OverviewTab = lazy(() => PD().then((m) => ({ default: m.OverviewTab })));
const BudgetTab = lazy(() => PD().then((m) => ({ default: m.BudgetTab })));
const InvoicesTab = lazy(() => PD().then((m) => ({ default: m.InvoicesTab })));
const DrawsTab = lazy(() => PD().then((m) => ({ default: m.DrawsTab })));
const ScheduleTab = lazy(() => PD().then((m) => ({ default: m.ScheduleTab })));
const CashflowTab = lazy(() => PD().then((m) => ({ default: m.CashflowTab })));
const InvestorsTab = lazy(() => PD().then((m) => ({ default: m.InvestorsTab })));
const DocumentsTab = lazy(() => PD().then((m) => ({ default: m.DocumentsTab })));
const UpdatesTab = lazy(() => PD().then((m) => ({ default: m.UpdatesTab })));

function Root() { return <><ScrollRestoration /><Suspense fallback={<div className="container-x py-16"><Spinner /></div>}><Outlet /></Suspense></>; }

export const router = (IS_DEMO ? createHashRouter : createBrowserRouter)([
  { element: <Root />, children: [
    { element: <AppShell />, children: [
      { path: '/', element: <HomePage /> },
      { path: '/feasibility', element: <FeasibilityPage /> },
      { path: '/pricing', element: <PricingPage /> },
      { path: '/calculator', element: <CalculatorPage /> },
      { path: '/homebuilder', element: <HomebuilderPage /> },
      { path: '/builders', element: <BuildersPage /> },
      { path: '/forbuilders', element: <BuildersPage /> },
      { path: '/get-started', element: <GetStartedPage /> },
      { path: '/rebuild', element: <GetStartedPage /> },
      { path: '/ai', element: <AIPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/verify', element: <VerifyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ] },
    { path: '/app', element: <PortalLayout />, children: [
      { index: true, element: <DashboardPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'feasibility/:runId', element: <SavedRunPage /> },
      { path: 'projects/:id', element: <ProjectLayout />, children: [
        { index: true, element: <OverviewTab /> }, { path: 'budget', element: <BudgetTab /> }, { path: 'invoices', element: <InvoicesTab /> }, { path: 'draws', element: <DrawsTab /> }, { path: 'schedule', element: <ScheduleTab /> }, { path: 'cashflow', element: <CashflowTab /> }, { path: 'investors', element: <InvestorsTab /> }, { path: 'documents', element: <DocumentsTab /> }, { path: 'updates', element: <UpdatesTab /> },
      ] },
    ] },
  ] },
]);
