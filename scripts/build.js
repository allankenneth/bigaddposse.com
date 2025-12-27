#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const membersPath = path.join(rootDir, 'members.json');
const outputPath = path.join(rootDir, 'index.html');

// Read members data
const members = JSON.parse(fs.readFileSync(membersPath, 'utf8'));

// Group members by year
const membersByYear = {};
members.forEach(member => {
  const year = member.year;
  if (!membersByYear[year]) {
    membersByYear[year] = [];
  }
  membersByYear[year].push(member);
});

// Get sorted years
const years = Object.keys(membersByYear).map(Number).sort((a, b) => a - b);

// Helper to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Helper to format nickname for display (title case)
function formatNickname(nickname) {
  if (!nickname) return '';
  // Keep original casing for names that are already properly formatted
  // Only title case if all uppercase
  if (nickname === nickname.toUpperCase() && nickname.length > 2) {
    return nickname.charAt(0).toUpperCase() + nickname.slice(1).toLowerCase();
  }
  // Capitalize first letter of each word for lowercase nicknames
  if (nickname === nickname.toLowerCase()) {
    return nickname.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
  return nickname;
}

// Generate timeline navigation links
const timelineLinks = years.map(year =>
  `    <a href="#y${year}" class="year-link" data-year="${year}">${year}</a>`
).join('\n');

// Generate year sections
const yearSections = years.map(year => {
  const yearMembers = membersByYear[year];
  const memberCards = yearMembers.map(member => {
    const nicknameHtml = member.nickname
      ? `\n        <span class="member-nickname">${escapeHtml(formatNickname(member.nickname))}</span>`
      : '';

    const videoHtml = member.video
      ? `\n      <a href="${escapeHtml(member.video)}" target="_blank" rel="noopener" class="video-link" title="Watch video"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></a>`
      : '';

    return `    <article class="member-card${member.video ? ' has-video' : ''}">
      <img src="${escapeHtml(member.photo)}" alt="${escapeHtml(member.name)}" loading="lazy">${videoHtml}
      <div class="member-info">
        <h3 class="member-name">${escapeHtml(member.name)}</h3>${nicknameHtml}
      </div>
    </article>`;
  }).join('\n');

  return `<section class="year-section" id="y${year}">
  <header class="year-header"><h2 class="year-title">${year}</h2></header>
  <div class="members-grid">
${memberCards}
  </div>
</section>`;
}).join('\n\n');

// Generate the full HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Big Add Posse</title>
<style>
:root {
  --bg-dark: #0f0f1a;
  --bg-card: #1a1a2e;
  --bg-timeline: #16213e;
  --accent: #00d4ff;
  --accent-light: #66e5ff;
  --text: #ccd6f6;
  --text-muted: #8892b0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 80px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-dark);
  color: var(--text);
  line-height: 1.6;
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  color: var(--accent-light);
}

/* Header */
.site-header {
  text-align: center;
  padding: 3rem 1rem 2rem;
  background: linear-gradient(180deg, var(--bg-timeline) 0%, var(--bg-dark) 100%);
}

.site-title {
  font-size: clamp(2.5rem, 8vw, 4rem);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.25rem;
  color: var(--text);
  line-height: 0.9;
}

.site-title strong {
  display: block;
  font-size: 1.3em;
  line-height: 0.9;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.site-description {
  max-width: 600px;
  margin: 1rem auto;
  color: var(--text-muted);
}

.btn {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
  font-weight: 600;
  margin-top: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn:hover {
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 212, 255, 0.4);
}

.member-count {
  margin-top: 1.5rem;
  font-size: 1.1rem;
}

.member-count strong {
  color: var(--accent);
  font-size: 1.4em;
}

/* Timeline Navigation */
.timeline-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-timeline);
  border-bottom: 1px solid rgba(0, 212, 255, 0.2);
  display: flex;
  align-items: center;
}

.timeline-nav-inner {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem 0.5rem 0;
  gap: 0.5rem;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) var(--bg-timeline);
}

.timeline-nav-inner::-webkit-scrollbar {
  height: 4px;
}

.timeline-nav-inner::-webkit-scrollbar-track {
  background: var(--bg-timeline);
}

.timeline-nav-inner::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 2px;
}

.timeline-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  white-space: nowrap;
  padding-right: 0.5rem;
  border-right: 1px solid rgba(255,255,255,0.1);
  margin-right: 0.5rem;
}

.year-link {
  padding: 0.5rem 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.9rem;
  border-radius: 4px;
  transition: all 0.2s;
  white-space: nowrap;
}

.year-link:hover {
  color: var(--text);
  background: rgba(0, 212, 255, 0.1);
}

.year-link.active {
  color: #fff;
  background: var(--accent);
}

.top-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  color: var(--text-muted);
  text-decoration: none;
  border-right: 1px solid rgba(255,255,255,0.1);
  transition: color 0.2s;
}

.top-link:hover {
  color: var(--text);
}

.top-link svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

/* Search */
.search-container {
  max-width: 400px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

.search-box {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 2px solid transparent;
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text);
  transition: border-color 0.2s;
}

.search-box::placeholder {
  color: var(--text-muted);
}

.search-box:focus {
  outline: none;
  border-color: var(--accent);
}

.search-info {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
  min-height: 1.5rem;
  padding: 0 1rem;
}

/* Main Content */
.main-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1rem 4rem;
}

/* Year Sections */
.year-section {
  margin-bottom: 3rem;
  scroll-margin-top: 80px;
}

.year-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--accent);
}

.year-header::before {
  content: '';
  width: 12px;
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--bg-dark), 0 0 0 6px var(--accent);
}

.year-title {
  font-size: 1.75rem;
  color: var(--accent);
  font-weight: 700;
}

/* Member Grid */
.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1.5rem;
}

/* Member Cards */
.member-card {
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
}

.member-card.has-video {
  position: relative;
}

.member-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
}

.member-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.member-info {
  padding: 1rem;
  text-align: center;
}

.member-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.25rem;
}

.member-nickname {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent);
}

/* Video link button */
.video-link {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 36px;
  height: 36px;
  background: var(--accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: transform 0.2s, background 0.2s;
}

.video-link:hover {
  transform: scale(1.1);
  background: var(--accent-light);
}

.video-link svg {
  width: 16px;
  height: 16px;
  fill: #fff;
  margin-left: 2px;
}

/* Hidden state for search */
.member-card.hidden,
.year-section.hidden {
  display: none;
}

/* Mobile */
@media (max-width: 600px) {
  .members-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .member-info {
    padding: 0.75rem;
  }

  .member-name {
    font-size: 0.85rem;
  }

  .member-nickname {
    font-size: 0.7rem;
  }

  .timeline-label {
    display: none;
  }
}
</style>
</head>
<body>

<header class="site-header">
  <h1 class="site-title">Big Add<strong>Posse</strong></h1>
  <p class="site-description">The Big ADD Posse (BAP) are a group of skilled freestyle footbag players who have contributed to the progression of that sport in a unique way. The group is invite-only, and the only way to get an invitation is to shred hard in front of other members and prove your style.</p>
  <a href="tale-of-bap.html" class="btn">Read the Tale of the BAP</a>
  <p class="member-count">There are <strong>${members.length}</strong> members of BAP</p>
</header>

<nav class="timeline-nav" id="timeline-nav">
  <a href="#" class="top-link" title="Back to top"><svg viewBox="0 0 24 24"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg></a>
  <div class="timeline-nav-inner">
${timelineLinks}
  </div>
</nav>

<div class="search-container">
  <input type="text" class="search-box" id="search" placeholder="Search by name or nickname..." autocomplete="off">
</div>
<p class="search-info" id="search-info"></p>

<main class="main-content" id="members">

${yearSections}

</main>

<script>
(function() {
  // Scrollspy for timeline navigation
  const sections = document.querySelectorAll('.year-section');
  const yearLinks = document.querySelectorAll('.year-link');
  const nav = document.getElementById('timeline-nav');
  const navInner = nav.querySelector('.timeline-nav-inner');
  let isSearching = false;

  function updateActiveYear() {
    // Disable scrollspy highlighting when searching
    if (isSearching) {
      yearLinks.forEach(link => link.classList.remove('active'));
      return;
    }

    const navHeight = nav.offsetHeight + 20;
    let current = '';

    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= navHeight + 100) {
        current = section.id;
      }
    });

    yearLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
        // Scroll nav horizontally to show active year (without affecting page scroll)
        const linkLeft = link.offsetLeft;
        const navWidth = navInner.offsetWidth;
        const linkWidth = link.offsetWidth;
        navInner.scrollTo({
          left: linkLeft - (navWidth / 2) + (linkWidth / 2),
          behavior: 'smooth'
        });
      }
    });
  }

  window.addEventListener('scroll', updateActiveYear, { passive: true });
  updateActiveYear();

  // Search functionality - reads from DOM, no JSON needed
  const searchBox = document.getElementById('search');
  const searchInfo = document.getElementById('search-info');
  const cards = document.querySelectorAll('.member-card');

  searchBox.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase().trim();
    let visibleCount = 0;

    if (!query) {
      isSearching = false;
      cards.forEach(card => card.classList.remove('hidden'));
      sections.forEach(section => section.classList.remove('hidden'));
      searchInfo.textContent = '';
      updateActiveYear();
      return;
    }

    isSearching = true;
    yearLinks.forEach(link => link.classList.remove('active'));

    cards.forEach(card => {
      const name = card.querySelector('.member-name').textContent.toLowerCase();
      const nicknameEl = card.querySelector('.member-nickname');
      const nickname = nicknameEl ? nicknameEl.textContent.toLowerCase() : '';

      if (name.includes(query) || nickname.includes(query)) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    sections.forEach(section => {
      const visibleCards = section.querySelectorAll('.member-card:not(.hidden)');
      if (visibleCards.length === 0) {
        section.classList.add('hidden');
      } else {
        section.classList.remove('hidden');
      }
    });

    searchInfo.textContent = \`Showing \${visibleCount} of \${cards.length} members\`;
  });
})();
</script>

</body>
</html>
`;

// Write the output file
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Generated index.html with ${members.length} members across ${years.length} years`);
