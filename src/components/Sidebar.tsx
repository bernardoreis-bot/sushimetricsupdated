import { LayoutDashboard, ShoppingCart, FileSpreadsheet, Building2, Package, Tag, ClipboardList, FileSearch, TrendingUp, LogOut, Link2, Users, Mail, Palette, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const menuSections = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'powerbi', label: 'PowerBI Sales', icon: BarChart3 },
      ]
    },
    {
      title: 'Invoice Processing',
      items: [
        { id: 'transactions', label: 'Transactions', icon: ShoppingCart },
        { id: 'parsing', label: 'Invoice Rules', icon: FileSearch },
      ]
    },
    {
      title: 'Stock Management',
      items: [
        { id: 'stockcount', label: 'Stock Count', icon: ClipboardList },
        { id: 'itemmapping', label: 'Stock Item Mapping', icon: Link2 },
        { id: 'stockanalysis', label: 'Stock Analysis', icon: BarChart3 },
      ]
    },
    {
      title: 'People Management',
      items: [
        { id: 'people', label: 'People Tracker', icon: Users },
      ]
    },
    {
      title: 'Production Planning',
      items: [
        { id: 'production', label: 'Production Updates', icon: FileSpreadsheet },
      ]
    },
    {
      title: 'Future Tools',
      items: [
        { id: 'predictions', label: 'Order Predictions', icon: TrendingUp },
      ]
    },
    {
      title: 'Settings',
      items: [
        { id: 'categories', label: 'Categories', icon: Tag },
        { id: 'sites', label: 'Sites', icon: Building2 },
        { id: 'suppliers', label: 'Suppliers', icon: Package },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'customization', label: 'Dashboard Design', icon: Palette },
      ]
    },
    {
      title: 'Support',
      items: [
        { id: 'contact', label: 'Contact Us', icon: Mail },
      ]
    }
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col overflow-hidden">
      <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-center flex-shrink-0">
        <img
          src="/Gemini_Generated_Image_2bqo5e2bqo5e2bqo.png"
          alt="Sushi Metrics"
          className="w-full h-auto"
        />
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        {menuSections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex > 0 ? 'mt-6' : ''}>
            <div className="mb-2 px-4">
              <div className="text-xs font-semibold text-gray-400 uppercase">
                {section.title}
              </div>
            </div>

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors min-h-[44px] active:scale-95 ${
                    isActive
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-700 hover:bg-orange-50 active:bg-orange-100'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200 flex-shrink-0">
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors min-h-[44px] active:scale-95"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
