export const config = {
  site: {
    title: "mutezebra`s blog",
    name: "mutezebra`s blog",
    description: "mutezebra`s blog",
    keywords: ["mutezebra", "K8s", "Go", "6.5840"],
    url: "https://mutezebra.github.io",
    baseUrl: "https://mutezebra.github.io",
    image: "https://mutezebra.github.io/og-image.png",
    favicon: {
      ico: "/favicon.ico",
      png: "/favicon.png",
      svg: "/favicon.svg",
      appleTouchIcon: "/favicon.png",
    },
    manifest: "/site.webmanifest",
    rss: {
      title: "Nextjs Blog Template",
      description: "Thoughts on Full-stack development, AI",
      feedLinks: {
        rss2: "/rss.xml",
        json: "/feed.json",
        atom: "/atom.xml",
      },
    },
  },
  author: {
    name: "mutezebra",
    email: "mutezebra@qq.com",
    bio: "Untouched, unknown.",
  },
  social: {
    github: "https://github.com/mutezebra",
    // x: "https://x.com/mutezebra",
    // xiaohongshu: "https://www.xiaohongshu.com/user/profile/xxx",
    // wechat: "https://storage.xxx.com/images/wechat-official-account.png",
    // buyMeACoffee: "https://www.buymeacoffee.com/xxx",
  },
  giscus: {
    repo: "mutezebra/nextjs-blog-template",
    repoId: "R_kgDOPV1DdQ",
    categoryId: "DIC_kwDOPV1Ddc4CtnpV",
  },
  navigation: {
    main: [
      { 
        title: "文章", 
        href: "/blog",
      },
    ],
  },
  seo: {
    metadataBase: new URL("https://xxx.com"),
    alternates: {
      canonical: './',
    },
    openGraph: {
      type: "website" as const,
      locale: "zh_CN",
    },
    twitter: {
      card: "summary_large_image" as const,
      creator: "@xxx",
    },
  },
};
