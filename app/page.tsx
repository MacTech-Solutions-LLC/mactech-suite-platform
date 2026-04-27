/**
 * MacTech Suite - Landing Page
 * MT-019: Local Development Entry Point
 */

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          MacTech Suite
        </h1>
        
        <p className="text-xl text-gray-300">
          Multi-tenant SaaS Platform
        </p>
        
        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-emerald-400">
            MT-019: Local Development Sandbox
          </h2>
          
          <div className="space-y-3 text-sm text-gray-400 text-left">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span>Database: Docker Postgres (not started)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span>Migrations: Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span>Seed: Pending</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 justify-center">
          <a 
            href="/api/tenant" 
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
          >
            Test API
          </a>
          <a 
            href="https://github.com/bmacdonald417/mactech-suite-platform" 
            target="_blank"
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            GitHub
          </a>
        </div>
        
        <p className="text-xs text-gray-500 mt-8">
          Branch: feat/MT-019-docker-seed
        </p>
      </div>
    </main>
  );
}
