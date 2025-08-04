import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import UserDashboard from './UserDashboard';
import AdminDashboard from './AdminDashboard';
import { LogOut, User, Shield } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="card-dark shadow-lg border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="gradient-orange w-10 h-10 rounded-lg flex items-center justify-center mr-3 pulse-glow">
                <span className="text-white font-bold text-lg">B</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-100">Blaze Bot</h1>
                <p className="text-sm text-slate-400">
                  {user.isAdmin ? 'Painel Administrativo' : 'Painel do Usuário'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Status de conexão */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'status-online' : 'status-offline'}`} />
                <span className="text-sm text-slate-300">
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>

              {/* Informações do usuário */}
              <div className="flex items-center space-x-2 px-3 py-2 bg-slate-700 rounded-lg">
                {user.isAdmin ? (
                  <Shield className="w-4 h-4 text-orange-500" />
                ) : (
                  <User className="w-4 h-4 text-blue-500" />
                )}
                <span className="text-sm font-medium text-slate-200">{user.username}</span>
              </div>

              {/* Botão de logout */}
              <button
                onClick={logout}
                className="flex items-center space-x-2 px-3 py-2 text-slate-300 hover:text-slate-100 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user.isAdmin ? <AdminDashboard /> : <UserDashboard />}
      </main>
    </div>
  );
};

export default Dashboard;