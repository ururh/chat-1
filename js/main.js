'use strict';
const el = id => document.getElementById(id);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const firstQuestionIndex = MESSAGES.findIndex(item => Array.isArray(item.choices));
const INTRO_MESSAGES = MESSAGES.slice(0, firstQuestionIndex);
const QUESTIONS = MESSAGES.filter(item => Array.isArray(item.choices));
const FOLLOWUP = MESSAGES.slice(firstQuestionIndex + QUESTIONS.length);
const answers = [];
let questionIndex = 0;
let answerLocked = false;
let finished = false;
let reviewMode = false;
let reviewExpanded = false;
let rewardUsed = false;
let typingActive = false;

function scrollToBottom() {
  const node = el('chatScroll');
  requestAnimationFrame(() => node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' }));
}

function setStage(stage) {
  document.querySelectorAll('.step').forEach((item, index) => {
    item.classList.toggle('active', index === stage);
    item.classList.toggle('complete', index < stage);
    item.querySelector('.step-index').textContent = index < stage ? '✓' : String(index + 1);
  });
  el('headerStatus').textContent = `${UI_TEXT.stagePrefix} ${stage + 1} ${UI_TEXT.stageSeparator} 4`;
}

function toast(message, ms = 4400) {
  if (!UI_TEXT.notificationEnabled || !message) return;
  const region = el('toastRegion');
  const node = document.createElement('div');
  node.className = 'toast';
  const body = document.createElement('span');
  body.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', UI_TEXT.closeToast);
  close.textContent = '×';
  close.onclick = () => node.remove();
  node.append(body, close);
  region.append(node);
  setTimeout(() => node.remove(), ms);
}

let socialProofTimer = null;
let socialProofIndex = 0;

function showSocialProof() {
  if (!UI_TEXT.socialProofEnabled || !UI_TEXT.notificationEnabled) return;

  const messages = VARS.MSGS.socialProof;

  if (!Array.isArray(messages) || messages.length === 0) return;

  toast(messages[socialProofIndex], UI_TEXT.socialProofDuration);

  socialProofIndex = (socialProofIndex + 1) % messages.length;
}

function scheduleSocialProof() {
  if (!UI_TEXT.socialProofEnabled || !UI_TEXT.notificationEnabled) return;

  const minDelay = UI_TEXT.socialProofMinDelay;
  const maxDelay = UI_TEXT.socialProofMaxDelay;

  const randomDelay = minDelay + Math.random() * (maxDelay - minDelay);

  socialProofTimer = setTimeout(() => {
    showSocialProof();
    scheduleSocialProof();
  }, randomDelay);
}

function stopSocialProof() {
  clearTimeout(socialProofTimer);
  socialProofTimer = null;
}

function makeDoctorBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'message';
  const avatar = document.createElement('div');
avatar.className = 'message-avatar';
const img = document.createElement('img');
img.src = VARS.docAvatar;
img.alt = VARS.docName;
avatar.appendChild(img);
  const body = document.createElement('div');
  body.className = 'message-body';
  const author = document.createElement('div');
  author.className = 'message-author';
  author.textContent = VARS.docName;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString(UI_TEXT.dateLocale, {hour:'2-digit',minute:'2-digit'});
  body.append(author, bubble, time);
  wrap.append(avatar, body);
  el('chatStream').append(wrap);
  scrollToBottom();
  return bubble;
}

async function addDoctorMessage(content) {
  const bubble = makeDoctorBubble();

  if (content.includes('<img')) {
    const template = document.createElement('template');
    template.innerHTML = content.trim();

    const img = template.content.querySelector('img');

    if (img) {
      img.onerror = () => {
        bubble.textContent = UI_TEXT.imageFallback;
      };

      bubble.append(img);
    }

    scrollToBottom();
    await delay(UI_TEXT.typingPause);
    return;
  }

  const typing = document.createElement('div');
  typing.className = 'typing-indicator';

  typing.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;

  bubble.append(typing);
  scrollToBottom();

  const textLength = content.replace(/<[^>]*>/g, '').length;
  const typingDuration = Math.min(2000, Math.max(700, textLength * 8));

  await delay(typingDuration);

  typing.remove();

  const message = document.createElement('div');
  message.className = 'message-reveal';
  message.innerHTML = content;

  bubble.append(message);
  scrollToBottom();

  await delay(UI_TEXT.typingPause);
}

function initQuestions() {
  const track = el('questionTrack');
  track.replaceChildren();
  QUESTIONS.forEach((q, index) => {
    const slide = document.createElement('div');
    slide.className = 'question-slide';
    const title = document.createElement('h2');
    title.textContent = q.text;
    const grid = document.createElement('div');
    grid.className = 'choice-grid';
    q.choices.forEach((choice, choiceIndex) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      const label = document.createElement('span');
      label.textContent = choice;
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent = '→';
      button.append(label, arrow);
      button.addEventListener('click', () => chooseAnswer(index, choiceIndex, button));
      grid.append(button);
    });
    slide.append(title, grid);
    track.append(slide);
  });
  updateQuestionUI();
}

function updateQuestionHeight() {
  const section = el('questionSection');
  const details = el('questionDetails');
  const viewport = el('questionViewport');
  const track = el('questionTrack');

  if (!section || !viewport || !track) return;
  if (section.hidden) return;
  if (details && details.hidden) return;

  const slides = track.querySelectorAll('.question-slide');
  const activeSlide = slides[questionIndex];

  if (!activeSlide) return;

  viewport.style.height = `${Math.ceil(activeSlide.scrollHeight)}px`;
}

function initQuestionResize() {
  window.addEventListener('resize', () => {
    requestAnimationFrame(updateQuestionHeight);
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      updateQuestionHeight();
    });

    document.querySelectorAll('.question-slide').forEach(slide => {
      observer.observe(slide);
    });
  }
}


function updateQuestionUI() {
  el('questionTrack').style.transform = `translateX(-${questionIndex * 100}%)`;
  el('questionCounter').textContent =
    `${questionIndex + 1} / ${QUESTIONS.length}`;
  el('questionProgress').style.width =
    `${((questionIndex + 1) / QUESTIONS.length) * 100}%`;
  el('backQuestion').hidden = true;
  requestAnimationFrame(updateQuestionHeight);
}

function updateReviewNavigation() {
  const nav = el('questionReviewNav');
  const counter = el('reviewCounter');
  const prev = el('reviewPrev');
  const next = el('reviewNext');

  if (!nav || !counter || !prev || !next) return;

  nav.hidden = !reviewMode;

  if (!reviewMode) return;

  counter.textContent = `${questionIndex + 1} / ${QUESTIONS.length}`;

  prev.disabled = questionIndex === 0;
  next.disabled = questionIndex === QUESTIONS.length - 1;
}

function showReviewQuestion(index) {
  if (!reviewMode || !reviewExpanded) return;
  if (index < 0 || index >= QUESTIONS.length) return;

  questionIndex = index;

  updateQuestionUI();
  updateReviewNavigation();
}

function toggleQuestionReview() {
  if (!reviewMode) return;

  reviewExpanded = !reviewExpanded;

  const details = el('questionDetails');
  const summary = el('questionSummary');
  const action = el('questionSummaryAction');

  details.hidden = !reviewExpanded;

  summary.setAttribute(
    'aria-expanded',
    String(reviewExpanded)
  );

  action.textContent = reviewExpanded
    ? 'Zwiń ↑'
    : 'Zobacz ↓';

if (reviewExpanded) {
  requestAnimationFrame(() => {
    updateQuestionHeight();
  });
  }
}
function moveQuestionToChatHistory() {
  const section = el('questionSection');
  const stream = el('chatStream');

  if (!section || !stream) return;

  if (section.parentElement !== stream) {
    stream.appendChild(section);
  }
}
function enableReviewMode() {
  reviewMode = true;
  reviewExpanded = false;
moveQuestionToChatHistory();
  const section = el('questionSection');
  const summary = el('questionSummary');
  const details = el('questionDetails');
  const footerText = el('questionFooterText');

  section.hidden = false;
  section.classList.add('review-mode');

  summary.hidden = false;
  summary.setAttribute('aria-expanded', 'false');

  details.hidden = true;

  if (footerText) {
    footerText.textContent = 'Twoje zapisane odpowiedzi';
  }

  document.querySelectorAll('.question-slide').forEach((slide, index) => {
    const buttons = slide.querySelectorAll('.choice');

    buttons.forEach((button, choiceIndex) => {
      const selected = answers[index] === choiceIndex;

      button.disabled = true;
      button.classList.toggle('selected', selected);

      const arrow = button.lastElementChild;

      if (arrow) {
        arrow.textContent = selected ? '✓' : '';
      }
    });
  });

  questionIndex = 0;

  updateQuestionUI();
  updateReviewNavigation();
}

function initQuestionReview() {
  el('questionSummary')?.addEventListener(
    'click',
    toggleQuestionReview
  );

  el('reviewPrev')?.addEventListener('click', () => {
    showReviewQuestion(questionIndex - 1);
  });

  el('reviewNext')?.addEventListener('click', () => {
    showReviewQuestion(questionIndex + 1);
  });
}


async function chooseAnswer(index, choiceIndex, button) {
  if (answerLocked || finished || index !== questionIndex) return;

  answerLocked = true;
  answers[index] = choiceIndex;

  button.classList.add('selected');
  button.lastElementChild.textContent = '✓';

  await delay(450);

  if (index < QUESTIONS.length - 1) {
    questionIndex++;
    updateQuestionUI();
    answerLocked = false;
    scrollToBottom();
    return;
  }

  finished = true;

  enableReviewMode();

  el('loadingCard').hidden = false;

  setStage(2);
  toast(UI_TEXT.nextStageNotice);
  scrollToBottom();

  await delay(UI_TEXT.analysisDuration);

  el('loadingCard').hidden = true;

  for (const item of FOLLOWUP) {
    await addDoctorMessage(item.text);
  }

  el('rewardSection').hidden = false;

  setStage(3);
  scrollToBottom();
}

let orderTimerInterval = null;

function startOrderTimer() {
  clearInterval(orderTimerInterval);

  const duration = 10 * 60 * 1000;
  const endTime = Date.now() + duration;

  const hoursEl = el('timerHours');
  const minutesEl = el('timerMinutes');
  const secondsEl = el('timerSeconds');

  const format = value => String(value).padStart(2, '0');

  function updateTimer() {
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    hoursEl.textContent = format(hours);
    minutesEl.textContent = format(minutes);
    secondsEl.textContent = format(seconds);

    if (remaining === 0) {
      clearInterval(orderTimerInterval);
      orderTimerInterval = null;
    }
  }

  updateTimer();

  orderTimerInterval = setInterval(updateTimer, 250);
}

function initReward() {
  document.querySelectorAll('.reward-card').forEach(card => {
    card.addEventListener('click', async () => {
      if (rewardUsed) return;
      rewardUsed = true;
      document.querySelectorAll('.reward-card').forEach(c => c.disabled = true);
      card.classList.add('flipped');
      el('rewardFeedback').textContent = UI_TEXT.rewardReady;
      await delay(UI_TEXT.bonusRevealDelay);
      el('bonusModal').hidden = false;
      el('claimBonus').focus();
    });
  });
el('claimBonus').addEventListener('click', () => {
  el('bonusModal').hidden = true;
  el('rewardSection').hidden = true;
  el('orderSection').hidden = false;
  startOrderTimer();
  toast(VARS.MSGS.wheelPopup);
  scrollToBottom();
});
}

function initForm() {
  el('orderFormElement').addEventListener('submit', event => {
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.replace(/\D/g, '');
    if (name.length < 2) {
      event.preventDefault(); toast(VARS.MSGS.validateForm.name); form.elements.name.focus(); return;
    }
    if (phone.length < 9) {
      event.preventDefault(); toast(VARS.MSGS.validateForm.phone); form.elements.phone.focus(); return;
    }
  });
}
requestAnimationFrame(updateQuestionHeight);
async function start() {
  el('dateDivider').textContent = VARS.today;

initQuestions();
initQuestionResize();
initQuestionReview();
initReward();
initForm();

  toast(VARS.MSGS.welcome);
  scheduleSocialProof();
  await delay(350);

  for (const item of INTRO_MESSAGES) {
    await addDoctorMessage(item.text);
  }

  el('questionSection').hidden = false;
  setStage(1);
  requestAnimationFrame(() => {
  updateQuestionHeight();
    scrollToBottom();
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();