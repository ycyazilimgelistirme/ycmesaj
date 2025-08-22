const api = {
    base: "",
    tokenKey: "jwt",
    get token() { return localStorage.getItem(this.tokenKey) || ""; },
    set token(v) { localStorage.setItem(this.tokenKey, v); },
    headers() {
      const h = { "Content-Type": "application/json" };
      if (this.token) h["Authorization"] = "Bearer " + this.token;
      return h;
    }
  };
  
  // Çıkış
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "logoutBtn") {
      localStorage.removeItem(api.tokenKey);
    }
  });
  
  // Kayıt
  const regForm = document.getElementById("registerForm");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(regForm).entries());
      const res = await fetch("/api/auth/register", { method: "POST", headers: api.headers(), body: JSON.stringify(data) });
      if (!res.ok) return alert("Kayıt başarısız");
      location.href = "/login";
    });
  }
  
  // Giriş
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(loginForm).entries());
      const res = await fetch("/api/auth/login", { method: "POST", headers: api.headers(), body: JSON.stringify(data) });
      if (!res.ok) return alert("Hatalı bilgi");
      const json = await res.json();
      api.token = json.access_token;
      location.href = "/chat";
    });
  }
  