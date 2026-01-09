/**
 * Kairos Proactive Agent
 * Monitors context and triggers proactive insights
 */

(function (global) {
  'use strict';

  const { log } = global.Kairos;

  class ProactiveAgent {
    constructor(subtitleManager, overlayManager) {
      this.subtitleManager = subtitleManager;
      this.overlayManager = overlayManager;

      // Rule definitions for different types of insights
      this.rules = [
        {
          id: 'summary',
          icon: '💡',
          label: 'Summary',
          patterns: [
            "in summary", "to summarize", "conclusion", "bottom line", "takeaway",
            "wrap up", "end of the day", "all in all", "to conclude",
            "总结", "结论", "总而言之", "综上所述", "最后"
          ]
        },
        {
          id: 'emphasis',
          icon: '🔥',
          label: 'Key Point',
          patterns: [
            "please note", "key point", "crucial", "essential", "critical", "vital", "pay attention",
            "must remember", "don't forget", "number one thing", "most important",
            "highlight", "specifically", "fundamentally",
            "关键", "核心", "重点", "注意", "必须", "切记", "重中之重", "尤其是"
          ]
        },
        {
          id: 'definition',
          icon: '📝',
          label: 'Definition',
          patterns: [
            "in other words", "simply put", "basically means", "conceptually",
            "technically speaking", "defined as", "refers to", "what this means",
            "换句话说", "简单来说", "也就是说", "定义", "本质上", "指的是"
          ]
        },
        {
          id: 'action',
          icon: '🚀',
          label: 'Action Tip',
          patterns: [
            "pro tip", "best practice", "recommendation", "i suggest", "try to",
            "you should use", "advice", "tip is",
            "建议", "推荐", "技巧", "最佳实践", "试着", "提议"
          ]
        },
        {
          id: 'structure',
          icon: '🚩',
          label: 'Topic Change',
          patterns: [
            "first", "firstly", "secondly", "next step", "moving on", "turn our attention",
            "first point", "second point", "next point",
            "首先", "其次", "第一点", "第二点", "接下来", "下面"
          ]
        }
      ];

      this.lastCheckTime = Date.now();
      this.cooldown = 15000; // 15s cooldown
      this.lastTriggerTime = 0;
      this.interval = null;
    }

    init() {
      log('ProactiveAgent: Initialized with advanced rules');
      this.start();
    }

    start() {
      if (this.interval) clearInterval(this.interval);
      this.interval = setInterval(() => this.scan(), 2000);
    }

    stop() {
      if (this.interval) clearInterval(this.interval);
      this.interval = null;
    }

    scan() {
      if (!this.subtitleManager) return;

      const buffer = this.subtitleManager.buffer;
      if (!buffer || buffer.length === 0) return;

      const now = Date.now();
      if (now - this.lastTriggerTime < this.cooldown) return;

      // Check items added since last scan
      const newItems = buffer.filter(item => item.timestamp > this.lastCheckTime);
      this.lastCheckTime = now;

      if (newItems.length === 0) return;

      const recentText = newItems.map(i => i.text).join(' ').toLowerCase();

      // Scan against rules
      for (const rule of this.rules) {
        for (const pattern of rule.patterns) {
          if (recentText.includes(pattern)) {
            log(`ProactiveAgent: Detected [${rule.label}] pattern "${pattern}"`);
            this.triggerInsight(pattern, recentText, rule);
            return; // Trigger only one insight per scan
          }
        }
      }
    }

    triggerInsight(keyword, contextText, rule) {
      this.lastTriggerTime = Date.now();

      const video = document.querySelector('video');
      if (!video || !video.duration) return;

      const percentage = (video.currentTime / video.duration) * 100;

      this.overlayManager.createInsightMarker(percentage, {
        keyword: keyword,
        context: contextText,
        timestamp: video.currentTime,
        icon: rule.icon,
        label: rule.label,
        type: rule.id
      });
    }
  }

  global.Kairos.ProactiveAgent = ProactiveAgent;

})(window);
