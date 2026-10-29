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

function updateQuestionUI() {
  el('questionTrack').style.transform = `translateX(-${questionIndex * 100}%)`;
  el('questionCounter').textContent = `${questionIndex + 1} / ${QUESTIONS.length}`;
  el('questionProgress').style.width = `${(questionIndex + 1) / QUESTIONS.length * 100}%`;
  el('backQuestion').hidden = true;
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
  el('questionSection').hidden = true;
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

async function start() {
  el('dateDivider').textContent = VARS.today;

  initQuestions();
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
  scrollToBottom();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();