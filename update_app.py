import sys

def update_file():
    filepath = "src/App.tsx"
    with open(filepath, "r") as f:
        lines = f.readlines()
    
    # We want to replace lines 2517 to 2751 (0-indexed 2516 to 2751)
    # Let's verify line contents first
    start_line = 2516
    end_line = 2751
    
    if "return (" not in lines[start_line]:
        print("Error: start line does not match")
        sys.exit(1)
    
    if ")}\n" not in lines[end_line-1]:
        print("Error: end line does not match", repr(lines[end_line-1]))
        # We might need to adjust end_line to match Exactly
    
    new_content = """  if (jwtToken && appUser && appUser.hasSetupProfile === false) {
    return (
      <div id="setup-root" className="min-h-screen w-full flex items-center justify-center bg-[#09090b] font-sans text-white p-6 relative overflow-hidden select-none">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.1)_0%,transparent_60%)] blur-3xl animate-[pulse_10s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.1)_0%,transparent_60%)] blur-3xl animate-[pulse_12s_ease-in-out_infinite_reverse]" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        </div>

        {/* Setup Glass Card Container */}
        <div className="relative z-10 w-full max-w-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] p-8 md:p-12 space-y-8 max-h-[95vh] overflow-y-auto custom-scrollbar">
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
              <Activity className="w-7 h-7 text-white animate-pulse" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              Configure Your Agent
            </h2>
            <p className="text-sm text-zinc-400 font-medium max-w-lg mx-auto">
              Welcome to Jira Time Log Agent! Let's get you connected to your Jira instance and set up your preferred AI models to unlock advanced collaborative workflows.
            </p>
          </div>

          <form onSubmit={handleOnboardingSubmit} className="space-y-8">
            {onboardError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 font-medium flex items-start gap-3 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                <span>{onboardError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column: AI Models */}
              <div className="space-y-5 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                <div className="border-b border-white/10 pb-3">
                  <h3 className="text-lg font-semibold text-white">AI Capabilities</h3>
                  <p className="text-xs text-zinc-500">Select and configure your model</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">AI Provider</label>
                    <div className="relative group">
                      <select
                        value={onboardModelProvider}
                        onChange={(e) => {
                          const prov = e.target.value;
                          setOnboardModelProvider(prov);
                          setOnboardModelName(prov === "google" ? "gemini-3.5-flash" : "gpt-5.5");
                        }}
                        className="w-full appearance-none bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white hover:border-white/20 cursor-pointer"
                      >
                        <option value="google">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Model Version</label>
                    <div className="relative group">
                      <select
                        value={onboardModelName}
                        onChange={(e) => setOnboardModelName(e.target.value)}
                        className="w-full appearance-none bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white hover:border-white/20 cursor-pointer"
                      >
                        {onboardModelProvider === "google" ? (
                          <>
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fast)</option>
                            <option value="gemini-3.5-pro">Gemini 3.5 Pro (Flagship)</option>
                            <option value="gemini-3.1-pro">Gemini 3.1 Pro (Legacy)</option>
                          </>
                        ) : (
                          <>
                            <option value="gpt-5.5">GPT-5.5 (Flagship)</option>
                            <option value="gpt-5.2">GPT-5.2 (Legacy 2026)</option>
                            <option value="gpt-4.5">GPT-4.5 (Legacy)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {onboardModelProvider === "google" && (
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Gemini API Key</label>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">Get Key</a>
                      </div>
                      <div className="relative group">
                        <input
                          type={onboardShowGemini ? "text" : "password"}
                          value={onboardGeminiKey}
                          onChange={(e) => setOnboardGeminiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setOnboardShowGemini(!onboardShowGemini)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                        >
                          {onboardShowGemini ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                  )}

                  {onboardModelProvider === "openai" && (
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">OpenAI API Key</label>
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">Get Key</a>
                      </div>
                      <div className="relative group">
                        <input
                          type={onboardShowOpenai ? "text" : "password"}
                          value={onboardOpenaiKey}
                          onChange={(e) => setOnboardOpenaiKey(e.target.value)}
                          placeholder="sk-..."
                          className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setOnboardShowOpenai(!onboardShowOpenai)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                        >
                          {onboardShowOpenai ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Jira Connections */}
              <div className="space-y-5 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                <div className="border-b border-white/10 pb-3">
                  <h3 className="text-lg font-semibold text-white">Jira Connection</h3>
                  <p className="text-xs text-zinc-500">Provide Atlassian credentials</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Jira Domain</label>
                    <input
                      type="text"
                      value={onboardDomain}
                      onChange={(e) => setOnboardDomain(e.target.value)}
                      placeholder="your-company.atlassian.net"
                      required
                      className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Atlassian Email</label>
                    <input
                      type="email"
                      value={onboardEmail}
                      onChange={(e) => setOnboardEmail(e.target.value)}
                      placeholder="name@company.com"
                      required
                      className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">API Token</label>
                      <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">Get Token</a>
                    </div>
                    <div className="relative group">
                      <input
                        type={onboardShowPassword ? "text" : "password"}
                        value={onboardToken}
                        onChange={(e) => setOnboardToken(e.target.value)}
                        placeholder="Paste your API token here"
                        required
                        className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 pr-16 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setOnboardShowPassword(!onboardShowPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                      >
                        {onboardShowPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={onboardLoading}
                className="w-full py-4 bg-white text-black hover:bg-zinc-200 disabled:bg-white/20 disabled:text-white/40 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.01] active:scale-[0.99]"
              >
                {onboardLoading ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    <span>Configuring Agent...</span>
                  </>
                ) : (
                  <span>Launch Dashboard</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen bg-[#F4F5F7] text-[#091E42] font-sans flex flex-col antialiased">
"""
    
    lines = lines[:start_line] + [new_content] + lines[end_line:]
    
    with open(filepath, "w") as f:
        f.writelines(lines)
    
    print("Success")

update_file()
