import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { settingsAPI } from '../services/api';
import { Shield, ArrowLeft, ExternalLink } from 'lucide-react';

// This page is accessible without login, so it fetches branding directly
// (BrandingContext is available if user is logged in, but we can't depend on it here)
export default function CopyrightPage() {
  const [toolName, setToolName] = useState('InfraInventory');
  const [companyName, setCompanyName] = useState('');
  const [logoData, setLogoData] = useState('');
  const year = new Date().getFullYear();

  useEffect(() => {
    settingsAPI.getBranding()
      .then(r => {
        if (r.data.app_name)    setToolName(r.data.app_name);
        if (r.data.company_name) setCompanyName(r.data.company_name);
        if (r.data.logo_data)    setLogoData(r.data.logo_data);
        if (r.data.app_name)    document.title = `Copyright Notice — ${r.data.app_name}`;
      })
      .catch(() => {});
  }, []);

  const Section = ({ title, children }) => (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">{title}</h2>
      <div className="text-gray-600 leading-relaxed space-y-3">{children}</div>
    </div>
  );

  const BulletItem = ({ children }) => (
    <li className="flex items-start gap-2 text-gray-600">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoData
              ? <img src={logoData} alt="logo" className="w-8 h-8 object-contain rounded" />
              : <div className="w-8 h-8 bg-blue-800 rounded-lg flex items-center justify-center">
                  <Shield size={16} className="text-white" />
                </div>}
            <span className="font-bold text-gray-800">{toolName}</span>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium transition-colors"
          >
            <ArrowLeft size={15} /> Back to Application
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* Title block */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
            <Shield size={28} className="text-blue-700" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Copyright Notice</h1>
          <p className="text-gray-500 text-sm">Effective Date: {year}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-10">

          {/* Welcome */}
          <p className="text-gray-700 mb-8 text-base leading-relaxed">
            Welcome to the{' '}
            <strong className="text-gray-900">{toolName}</strong>
            {' '}("the Application").{' '}
            {companyName && (
              <>Operated by <strong className="text-gray-900">{companyName}</strong>.</>
            )}
          </p>

          <Section title="Ownership">
            <p>
              This Application was independently designed and developed by a Senior System Engineer
              to efficiently manage and maintain infrastructure inventory, including servers and virtual machines.
            </p>
            <p>
              All content, features, functionality, source code, design elements, and data structures
              within this Application are the exclusive property of the Application owner, unless
              otherwise stated. This includes but is not limited to:
            </p>
            <ul className="space-y-2 mt-3 ml-2">
              <BulletItem>Software code and scripts</BulletItem>
              <BulletItem>UI/UX design and layout</BulletItem>
              <BulletItem>Database structure and schema</BulletItem>
              <BulletItem>Documentation and technical content</BulletItem>
            </ul>
          </Section>

          <Section title="Code Modification Advisory">
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div className="space-y-2 text-sm text-amber-800">
                <p className="font-semibold">Important Advisory</p>
                <p>
                  This tool is actively used for maintaining critical infrastructure inventory.
                  Any changes to the existing codebase must be thoroughly tested in a controlled
                  environment before being applied to production.
                </p>
                <p>
                  Unauthorized or untested modifications may lead to data inconsistency,
                  application failure, or service disruption. It is strongly recommended
                  <strong> not to disturb or alter the existing code</strong> without proper
                  validation and approval.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Monitoring Notice">
            <p>
              Currently, this Application does not include any built-in monitoring or
              agent-based tracking mechanism. Users are responsible for implementing
              external monitoring, logging, and alerting systems as required.
            </p>
          </Section>

          <Section title="Updates to This Notice">
            <p>
              This copyright notice may be updated from time to time. Continued use of
              the Application constitutes acceptance of any changes.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For permissions, questions, or concerns regarding this notice, please contact
              the Application administrator.
            </p>
          </Section>

          {/* Bottom copyright line */}
          <div className="mt-10 pt-6 border-t-2 border-gray-100 text-center">
            <p className="text-sm text-gray-500 font-medium">
              © {year}{' '}
              <span className="font-bold text-gray-700">{toolName}</span>.
              {' '}All rights reserved.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Developed by{' '}
              <span className="font-semibold text-gray-600">Sharansakthi</span>
              {' – '}
              Senior System Engineer
            </p>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline font-medium">
            <ArrowLeft size={14} /> Return to {toolName}
          </Link>
        </div>
      </main>
    </div>
  );
}
