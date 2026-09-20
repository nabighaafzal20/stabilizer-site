
window.STABILIZER_CONFIG = {
  auth: {
    mode: 'supabase',           
    supabaseUrl: 'https://dhjfjurqntojngccrzsd.supabase.co',   
    supabaseAnonKey: 'sb_publishable_BIJc5WbRfFpgNeWXGfq7RA_4FFKDVmv',         
    apiBase: '/api/auth',
    sessionKey: 'stabilizer.session',   
    ttlMinutes: 480,
    dashboardUrl: 'dashboard/index.html',
    minIdentityLength: 3,
    minPasswordLength: 6,
    demoLatencyMs: 800,
    showDemoNotice: false
  },
  landing: {
    useMatte: true,       
    staticFrame: 200,      
    storyViewports: 8      
  }
};
