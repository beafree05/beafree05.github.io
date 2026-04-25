const shardCache = new Map();

const POS_LABELS = new Map([
  ["noun (common) (futsuumeishi)", "名词"],
  ["noun or participle which takes the aux. verb suru", "名词 / サ变可能"],
  ["transitive verb", "他动词"],
  ["intransitive verb", "自动词"],
  ["Godan verb with 'ru' ending", "五段动词"],
  ["Godan verb - Iku/Yuku special class", "五段动词"],
  ["Godan verb with 'u' ending", "五段动词"],
  ["Godan verb with 'ku' ending", "五段动词"],
  ["Godan verb with 'gu' ending", "五段动词"],
  ["Godan verb with 'su' ending", "五段动词"],
  ["Godan verb with 'tsu' ending", "五段动词"],
  ["Godan verb with 'nu' ending", "五段动词"],
  ["Godan verb with 'bu' ending", "五段动词"],
  ["Godan verb with 'mu' ending", "五段动词"],
  ["Ichidan verb", "一段动词"],
  ["adjective (keiyoushi)", "い形容词"],
  ["adjectival nouns or quasi-adjectives (keiyodoshi)", "形容动词"],
  ["adverb (fukushi)", "副词"],
  ["expressions (phrases, clauses, etc.)", "惯用表达"],
  ["noun, used as a suffix", "接尾名词"],
  ["noun, used as a prefix", "接头名词"],
  ["counter", "助数词"]
]);

const MISC_LABELS = new Map([
  ["slang", "俚语"],
  ["colloquial", "口语"],
  ["rare term", "较少见"],
  ["archaism", "古风"],
  ["honorific or respectful (sonkeigo) language", "敬语相关"],
  ["humble (kenjougo) language", "谦让语相关"],
  ["sensitive", "语感偏敏感"],
  ["vulgar expression or word", "粗俗表达"]
]);

const TERM_OVERRIDES = {
  "先鋭化": {
    coreJa: "物事の主張や性質が次第に鋭くなり、対立や極端さが増すこと。",
    glossEn: ["radicalization", "intensification", "sharpening"],
    synonyms: [
      {
        word: "過激化",
        note: "「先鋭化」よりも否定的に響きやすく、思想や運動が危険な方向へ強まる感じが出やすい。"
      },
      {
        word: "先鋭になる",
        note: "意味は近いが、名詞として整理するなら「先鋭化」のほうが論評文や説明文で扱いやすい。"
      },
      {
        word: "激化",
        note: "対立や衝突そのものが強まる時に使いやすく、主張や性質の“鋭さ”までは必ずしも含まない。"
      },
      {
        word: "極端化",
        note: "立場や傾向が中間を失って極に寄ることを表しやすく、「先鋭化」よりも意味の焦点が広い。"
      }
    ]
  }
};

function bucketForTerm(term) {
  if (!term) {
    return "misc";
  }

  const codepoint = term.codePointAt(0);
  if ((codepoint >= 0x3040 && codepoint <= 0x30ff) || codepoint < 0x0100) {
    return codepoint.toString(16).padStart(4, "0");
  }

  return (codepoint >> 8).toString(16);
}

async function loadShard(bucket) {
  if (!shardCache.has(bucket)) {
    const promise = fetch(`data/jmdict/shards/${bucket}.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load shard ${bucket}`);
        }
        return response.json();
      })
      .catch(() => ({}));
    shardCache.set(bucket, promise);
  }

  return shardCache.get(bucket);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function compactGlosses(entry) {
  return entry.sense
    .flatMap((sense) => sense.gloss || [])
    .filter(Boolean)
    .slice(0, 6);
}

function mapPos(entry) {
  const pos = entry.sense.flatMap((sense) => sense.pos || []);
  return uniqueValues(pos.map((item) => POS_LABELS.get(item) || item)).slice(0, 4);
}

function mapMisc(entry) {
  const misc = entry.sense.flatMap((sense) => sense.misc || []);
  return uniqueValues(misc.map((item) => MISC_LABELS.get(item) || item)).slice(0, 4);
}

function frequencyLabel(level) {
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    default:
      return "低";
  }
}

function inferAccent(entry) {
  const misc = mapMisc(entry);
  if (misc.includes("俚语") || misc.includes("口语")) {
    return "要确认";
  }

  return "要确认";
}

function buildJapaneseStyleDefinitions(entry) {
  return entry.sense.slice(0, 3).map((sense) => {
    const glosses = (sense.gloss || []).slice(0, 3);
    const pos = uniqueValues((sense.pos || []).map((item) => POS_LABELS.get(item) || item)).slice(0, 3);
    const misc = uniqueValues((sense.misc || []).map((item) => MISC_LABELS.get(item) || item)).slice(0, 2);
    const fields = uniqueValues((sense.field || []).filter(Boolean)).slice(0, 2);

    const parts = [];
    if (pos.length) {
      parts.push(`${pos.join("・")}として用いられる。`);
    }
    if (glosses.length) {
      parts.push(`英語義では「${glosses.join(" / ")}」に近い。`);
    }
    if (misc.length) {
      parts.push(`語感としては${misc.join("・")}の傾向を持つ。`);
    }
    if (fields.length) {
      parts.push(`主に${fields.join("・")}の文脈で見られる。`);
    }

    return parts.join("");
  });
}

function inferCoreJapaneseDefinition(term, entry) {
  const override = TERM_OVERRIDES[term] || TERM_OVERRIDES[entry.kanji[0]] || TERM_OVERRIDES[entry.reading[0]];
  if (override && override.coreJa) {
    return override.coreJa;
  }

  const glosses = compactGlosses(entry).slice(0, 3);
  const pos = mapPos(entry);
  const misc = mapMisc(entry);
  const parts = [];

  if (pos.length) {
    parts.push(`${pos[0]}として、`);
  }

  if (glosses.length) {
    parts.push(`おおむね「${glosses.join(" / ")}」に近い内容を表す語。`);
  } else {
    parts.push("文脈に応じて意味の働きが定まる語。");
  }

  if (misc.length) {
    parts.push(`語感としては${misc.join("・")}の傾向がある。`);
  }

  return parts.join("");
}

function inferEnglishGlossList(term, entry) {
  const override = TERM_OVERRIDES[term] || TERM_OVERRIDES[entry.kanji[0]] || TERM_OVERRIDES[entry.reading[0]];
  if (override && override.glossEn && override.glossEn.length) {
    return override.glossEn;
  }

  return compactGlosses(entry).slice(0, 4);
}

function buildChineseExplanation(entry) {
  const glosses = compactGlosses(entry);
  if (!glosses.length) {
    return "JMdict 里暂时没有足够可整理的核心义项，所以这里先不给出过强判断。更稳妥的做法是结合原句继续确认语义边界。";
  }

  return `JMdict 给出的核心英文义项包括 ${glosses.slice(0, 3).join(" / ")}。这里的中文解释是根据英文义项整理出的学习版说明，适合先抓核心意思，但细微语感仍然建议回到真实日语例句里确认。`;
}

function buildUsageFromEntry(entry) {
  const misc = mapMisc(entry);
  const isSlang = misc.includes("俚语");
  const isColloquial = misc.includes("口语");
  const isRare = misc.includes("较少见");

  if (isSlang) {
    return {
      daily: "中到高",
      sns: "高",
      news: "低",
      business: "需谨慎",
      academic: "低",
      interview: "不建议"
    };
  }

  if (isColloquial) {
    return {
      daily: "高",
      sns: "中到高",
      news: "中",
      business: "需谨慎",
      academic: "低到中",
      interview: "需谨慎"
    };
  }

  if (isRare) {
    return {
      daily: "低",
      sns: "低",
      news: "中",
      business: "需谨慎",
      academic: "中",
      interview: "需谨慎"
    };
  }

  return {
    daily: "中",
    sns: "中",
    news: "中",
    business: "中",
    academic: "中",
    interview: "需谨慎"
  };
}

function inferActiveUse(entry) {
  const misc = mapMisc(entry);
  if (misc.includes("俚语") || misc.includes("粗俗表达")) {
    return "需谨慎";
  }

  if (misc.includes("较少见") || misc.includes("古风")) {
    return "否";
  }

  return "是";
}

function inferNotFitScenes(entry) {
  const misc = mapMisc(entry);
  if (misc.includes("俚语")) {
    return "不适合论文、正式商务文、面试和 ES。";
  }

  if (misc.includes("粗俗表达")) {
    return "正式沟通、商务、课堂汇报和求职场景都不建议使用。";
  }

  if (misc.includes("较少见") || misc.includes("古风")) {
    return "如果没有把握真实语域，先不要放进日常主动输出和高风险正式写作。";
  }

  return "在面试、ES 或论文里使用前，最好先确认固定搭配和语域边界。";
}

function buildExampleSet(term, entry) {
  const writing = entry.kanji[0] || term;
  const gloss = compactGlosses(entry)[0] || "core meaning";
  const useWord = writing || term;

  return [
    {
      label: "1. 日常 / SNS 风格",
      ja: `この文脈で${useWord}を使うと、ちょっと言いすぎに聞こえないか気になった。`,
      zh: `我会在意在这个语境里用 ${useWord} 会不会听起来有点说得太重了。`,
      difficulty: "★☆☆",
      why: "句子结构直接，重点在于观察这个词放进日常语境时的自然度。",
      mimic: "是",
      alternative: ""
    },
    {
      label: "2. 新闻 / 评论风格",
      ja: `${useWord}という表現は、文脈によって評価的にも記述的にも働き方が変わる。`,
      zh: `${useWord} 这个表达会随着上下文不同，在评价色彩和描述功能上发生变化。`,
      difficulty: "★★☆",
      why: "适合训练评论型表达，能帮助学习者把词义和语感一起观察。",
      mimic: "是",
      alternative: ""
    },
    {
      label: "3. 稍正式 / 学术风格",
      ja: `本稿では、${useWord}の用法を「${gloss}」という英語義とのずれにも注意しながら整理する。`,
      zh: `本文将一边注意它与“${gloss}”这一英文义项之间的偏差，一边整理 ${useWord} 的用法。`,
      difficulty: "★★★",
      why: "带有说明文和轻学术写作色彩，更适合理解结构而不是原封不动模仿。",
      mimic: "需谨慎",
      alternative: `如果想写得更稳，可以改成「ここでは${useWord}の使い方を整理する」。`
    }
  ];
}

function buildSynonymHints(entry) {
  const override = TERM_OVERRIDES[entry.kanji[0]] || TERM_OVERRIDES[entry.reading[0]];
  if (override && override.synonyms && override.synonyms.length) {
    return override.synonyms;
  }

  const glosses = compactGlosses(entry);
  if (!glosses.length) {
    return [
      {
        word: "類義表現は要確認",
        note: "まずは実際の日本語例文を見てから、どの語と近いかを判断したほうが安全。"
      }
    ];
  }

  return [
    {
      word: "近い表現は要確認",
      note: "JMdict の英語義項から大まかな意味はつかめるが、日本語の類義語比較は実例ベースで詰めるほうが自然。"
    }
  ];
}

function buildMockAiLayer(term, entry) {
  const writing = entry.kanji[0] || term;
  const reading = entry.reading[0] || "要确认";
  const partOfSpeech = mapPos(entry).join(" / ") || "要确认";
  const usage = buildUsageFromEntry(entry);
  const coreDefinitionJa = inferCoreJapaneseDefinition(term, entry);
  const glossDefinitionsEn = inferEnglishGlossList(term, entry);

  return {
    writing,
    reading,
    partOfSpeech,
    accent: inferAccent(entry),
    frequency: frequencyLabel(entry.frequency),
    coreDefinitionJa,
    glossDefinitionsEn,
    dictExplanation: buildJapaneseStyleDefinitions(entry),
    cnExplanation: buildChineseExplanation(entry),
    usage,
    activeUse: inferActiveUse(entry),
    notFitScenes: inferNotFitScenes(entry),
    examples: buildExampleSet(term, entry),
    synonyms: buildSynonymHints(entry),
    advice: `${writing} 现在最适合按“先确认基本义和读音，再看语域，最后才决定是否主动使用”的顺序来学。先把它当成理解型词汇稳住，再决定要不要放进自己的输出里。`
  };
}

function buildSourceSummary(entry, matchedTerm) {
  const pos = mapPos(entry);
  const misc = mapMisc(entry);
  const pieces = [
    `命中 JMdict 词条：${matchedTerm || entry.kanji[0] || entry.reading[0] || "已命中"}`
  ];

  if (pos.length) {
    pieces.push(`可识别词性：${pos.join(" / ")}`);
  }

  if (misc.length) {
    pieces.push(`语体线索：${misc.join(" / ")}`);
  }

  pieces.push("读音、义项、词性来自本地 JMdict；例句、难度分析、使用场景来自本地 mock AI 层。");
  return pieces.join("；");
}

export async function lookupJMdictEntries(rawTerm, normalizedTerm = "") {
  const terms = uniqueValues([rawTerm, normalizedTerm]);
  const buckets = uniqueValues(terms.map(bucketForTerm));
  const shardEntries = await Promise.all(buckets.map((bucket) => loadShard(bucket)));

  for (const term of terms) {
    for (const shard of shardEntries) {
      if (shard[term]) {
        return {
          matchedTerm: term,
          entries: shard[term],
          suggestions: []
        };
      }
    }
  }

  const suggestions = [];
  for (const term of terms) {
    for (const shard of shardEntries) {
      for (const key of Object.keys(shard)) {
        if (key.includes(term) || term.includes(key)) {
          suggestions.push(key);
        }
        if (suggestions.length >= 8) {
          break;
        }
      }
    }
  }

  return {
    matchedTerm: "",
    entries: [],
    suggestions: uniqueValues(suggestions).slice(0, 8)
  };
}

export function buildReportFromJMdict(rawTerm, contextNote, lookupResult) {
  const entry = lookupResult.entries[0];
  const report = buildMockAiLayer(rawTerm, entry);

  return {
    ...report,
    input: rawTerm,
    contextNote,
    sourceType: "jmdict",
    matchedTerm: lookupResult.matchedTerm,
    suggestions: lookupResult.suggestions,
    sourceSummary: buildSourceSummary(entry, lookupResult.matchedTerm)
  };
}
