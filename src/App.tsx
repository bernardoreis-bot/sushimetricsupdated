import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import DashboardNew from './components/DashboardNew';
import TransactionsNew from './components/TransactionsNew';
import TransactionCategories from './components/TransactionCategories';
import Sites from './components/Sites';
import Suppliers from './components/Suppliers';
import ProductionSheetPanel from './components/ProductionSheetPanel';
import ProductionSheetPanelCopy from './components/ProductionSheetPanelCopy';
import StockCountNew from './components/StockCountNew';
import PowerBISales from './components/PowerBISales';
import ParsingRules from './components/ParsingRules';
import OrderPredictions from './components/OrderPredictions';
import ItemMapping from './components/ItemMapping';
import UserManagement from './components/UserManagement';
import ContactUs from './components/ContactUs';
import DashboardCustomization from './components/DashboardCustomization';
import StockAnalysis from './components/StockAnalysis';
import PeopleTrackerEnhanced from './components/PeopleTrackerEnhanced';
import TrailProgress from './components/TrailProgress';
import TrailProgressCopy from './components/TrailProgressCopy';
import AttensiProgress from './components/AttensiProgress';
import TestCopyComponents from './components/TestCopyComponents';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    loadCustomizationSettings();

    return () => subscription.unsubscribe();
  }, []);

  const loadCustomizationSettings = async () => {
    if (!isSupabaseConfigured) return;
    try {
      // Try localStorage first for instant load
      const cached = localStorage.getItem('dashboard_customization');
      if (cached) {
        applyCustomizationSettings(JSON.parse(cached));
      }

      // Then load from database
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'dashboard_customization')
        .maybeSingle();

      if (data?.setting_value) {
        const settings = JSON.parse(data.setting_value);
        applyCustomizationSettings(settings);
        localStorage.setItem('dashboard_customization', data.setting_value);
      }
    } catch (err) {
      console.error('Error loading customization:', err);
    }
  };

  const applyCustomizationSettings = (settings: any) => {
    const root = document.documentElement;

    // ALWAYS use light mode - remove dark class
    root.classList.remove('dark');
    document.body.style.backgroundColor = '';
    document.body.style.color = '';
    document.body.className = '';

    // Apply all CSS variables
    if (settings.primaryColor) {
      root.style.setProperty('--primary-color', settings.primaryColor);
    }
    if (settings.secondaryColor) {
      root.style.setProperty('--secondary-color', settings.secondaryColor);
    }
    if (settings.accentColor) {
      root.style.setProperty('--accent-color', settings.accentColor);
    }
    if (settings.buttonRadius) {
      root.style.setProperty('--button-radius', settings.buttonRadius);
    }
    if (settings.fontSize) {
      root.style.setProperty('--font-size', settings.fontSize);
    }
    if (settings.contentPadding) {
      root.style.setProperty('--content-padding', settings.contentPadding);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow p-6 max-w-md text-center">
          <h2 className="text-xl font-bold text-gray-900">Configuration required</h2>
          <p className="text-gray-600 mt-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex-1 overflow-auto">
        {currentPage === 'dashboard' && <DashboardNew />}
        {currentPage === 'transactions' && <TransactionsNew />}
        {currentPage === 'stockcount' && <StockCountNew />}
        {currentPage === 'powerbi' && <PowerBISales />}
        {currentPage === 'predictions' && <OrderPredictions />}
        {currentPage === 'production' && <ProductionSheetPanel />}
        {currentPage === 'production-copy' && <ProductionSheetPanelCopy />}
        {currentPage === 'itemmapping' && <ItemMapping />}
        {currentPage === 'stockanalysis' && <StockAnalysis />}
        {currentPage === 'people' && <PeopleTrackerEnhanced />}
        {currentPage === 'trail' && <TrailProgress />}
        {currentPage === 'trail-copy' && <TrailProgressCopy />}
        {currentPage === 'test-copy' && <TestCopyComponents />}
        {currentPage === 'attensi' && <AttensiProgress />}
        {currentPage === 'categories' && <TransactionCategories />}
        {currentPage === 'sites' && <Sites />}
        {currentPage === 'suppliers' && <Suppliers />}
        {currentPage === 'parsing' && <ParsingRules />}
        {currentPage === 'users' && <UserManagement />}
        {currentPage === 'customization' && <DashboardCustomization />}
        {currentPage === 'contact' && <ContactUs />}
      </div>
    </div>
  );
}

export default App;
