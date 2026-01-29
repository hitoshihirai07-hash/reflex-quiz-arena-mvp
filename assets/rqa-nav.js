(() => {
  const LINKS = [
    { href: "/play/", label: "遊ぶ" },
    { href: "/rules/", label: "ルール" },
    { href: "/mode/free/", label: "フリー対戦" },
    { href: "/mode/rated/", label: "レート対戦" },
    { href: "/faq/", label: "FAQ" },
    { href: "/story/", label: "ストーリー" },
    { href: "/puzzles/", label: "パズル" },
    { href: "/settings/", label: "設定" },
    { href: "/changelog/", label: "更新履歴" },
    { href: "/stats/", label: "戦績" },
  ];

  const norm = (p) => {
    try {
      if (!p) return "/";
      p = p.replace(/index\.html$/i, "");
      if (!p.startsWith("/")) p = "/" + p;
      // ensure trailing slash except root
      if (p !== "/" && !p.endsWith("/")) p += "/";
      return p;
    } catch (e) {
      return "/";
    }
  };

  const cur = norm(location.pathname);

  const isActive = (targetHref) => {
    const t = norm(targetHref);
    if (t === "/") return cur === "/";
    // highlight parent sections (e.g. /puzzles/2048/ -> /puzzles/)
    return cur === t || cur.startsWith(t);
  };

  document.querySelectorAll("[data-rqa-nav]").forEach((mount) => {
    const nav = document.createElement("nav");
    nav.className = "nav";

    const brand = document.createElement("a");
    brand.className = "brand";
    brand.href = "/";
    brand.innerHTML =
      '<span class="brandMark">RQA</span><span class="brandText">Reflex Quiz Arena</span>';

    const links = document.createElement("div");
    links.className = "navLinks";

    LINKS.forEach((item) => {
      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      if (isActive(item.href)) a.setAttribute("aria-current", "page");
      links.appendChild(a);
    });

    nav.appendChild(brand);
    nav.appendChild(links);

    mount.replaceWith(nav);
  });
})();
