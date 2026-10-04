"""Build a private, reviewable recipe import pack from user-supplied PDFs.

The input PDFs and generated recipe text must not be committed to the public site.
"""
import argparse
import hashlib
import json
import re
import subprocess
import html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/Users/leonidanchevskiy/Claude_Projects/Результаты/Детские_рецепты')
SOURCE = ROOT / 'private' / 'children-source.json'
NUM = r'(?:\d+(?:[.,]\d+)?(?:\s*/\s*\d+)?)'
UNIT = r'(?:ст\.?\s*л\.?|ч\.?\s*л\.?|мл|грамм\w*|гр\.?|г\b|шт\.?|стакан\w*|зубчик\w*)'
MAP = [
 (r'яйц|яиц', 'Яйцо куриное'), (r'пармезан', 'Сыр пармезан'),
 (r'моцарел', 'Сыр моцарелла'), (r'рикот', 'Рикотта'),
 (r'твердый сыр|твёрдый сыр', 'Сыр твёрдый'), (r'сливочн\w* масл|масл\w* сливоч', 'Масло сливочное'),
 (r'творог|творож', 'Творог 5%'), (r'кефир', 'Кефир 1%'), (r'йогурт', 'Йогурт натуральный'),
 (r'сметан', 'Сметана 20%'), (r'молок', 'Молоко 2.5%'),
 (r'кукурузн\w* мук', 'Кукурузная мука'), (r'пшеничн\w* мук|мук\w* пшенич', 'Мука пшеничная в/с'),
 (r'манк|манн', 'Манная крупа'), (r'овсян|овсяных хлоп|геркулес', 'Овсяные хлопья'),
 (r'рис\w* круп|кругл\w* рис|рис\b', 'Рис белый (сырой)'), (r'гречнев\w* круп', 'Гречка (сырая)'),
 (r'макарон', 'Макароны (сухие)'), (r'чечевиц', 'Чечевица (сухая)'),
 (r'курин\w* филе|курин\w* груд|филе кур', 'Курица (грудка)'), (r'индейк', 'Индейка (грудка)'),
 (r'треск', 'Треска'), (r'лосос', 'Лосось'),
 (r'цветн\w* капуст', 'Цветная капуста'), (r'брокколи', 'Брокколи'),
 (r'кабач|цуккини', 'Кабачок'), (r'морков', 'Морковь'), (r'картоф|картош', 'Картофель'),
 (r'св[её]кл', 'Свёкла'), (r'тыкв', 'Тыква'), (r'шпинат', 'Шпинат'),
 (r'сельдер', 'Сельдерей стеблевой'), (r'помидор|томат(?!н)', 'Помидор'),
 (r'лук|луковиц', 'Лук репчатый'), (r'чеснок', 'Чеснок'),
 (r'банан', 'Банан'), (r'яблок', 'Яблоко'), (r'груш', 'Груша'), (r'апельсин', 'Апельсин'),
 (r'авокадо', 'Авокадо'), (r'клубник', 'Клубника'), (r'малин', 'Малина'), (r'черник', 'Черника'),
 (r'изюм', 'Изюм'), (r'кураг', 'Курага'), (r'финик', 'Финики'),
 (r'оливков\w* масл', 'Оливковое масло'), (r'растительн\w* масл', 'Растительное масло'),
 (r'кокосов\w* масл', 'Кокосовое масло'), (r'м[её]д', 'Мёд'), (r'сахар', 'Сахар'),
 (r'кориц', 'Корица молотая'), (r'разрыхл', 'Разрыхлитель'), (r'сода|соды', 'Сода пищевая'),
 (r'соль|соли', 'Соль'), (r'вода|воды', 'Вода'), (r'какао', 'Какао-порошок'),
]

def tidy(text):
    return re.sub(r'\s+', ' ', text).strip(' .•+*—|')

def ingredient(line):
    original = tidy(line)
    text = original.lower().replace('ё', 'е')
    product = next((name for pattern, name in MAP if re.search(pattern.replace('ё', 'е'), text)), original)
    variant_text = re.sub(r'\d+\s*/\s*\d+', '', text)
    ambiguous = bool(re.search(r'или|люб\w*|/|по желанию|растительн\w* молок|кокосов\w* молок|гхи|овсян\w* мук|рисов\w* мук|детск\w* твор', variant_text))
    # A reference product with a different stated fat percentage is not the same food.
    percentages = re.findall(r'\d+(?:[.,]\d+)?\s*%',text)
    expected = {'Молоко 2.5%':'2.5%', 'Кефир 1%':'1%', 'Творог 5%':'5%', 'Сметана 20%':'20%'}
    if percentages and product in expected and expected[product] not in [x.replace(',','.').replace(' ','') for x in percentages]:
        ambiguous = True
    if ambiguous:
        product = original  # Never silently choose a food variant.
    m = re.search(rf'({NUM})\s*({UNIT})', text)
    if not m and product in ('Яйцо куриное', 'Яблоко', 'Банан', 'Груша', 'Лук репчатый', 'Морковь'):
        m = re.search(rf'({NUM})', text)
        unit = 'шт'
    else:
        unit = m[2] if m else 'г'
    amount = None
    if m:
        value = m[1].replace(',', '.').replace(' ', '')
        try:
            amount = float(value) if '/' not in value else float(value.split('/')[0]) / float(value.split('/')[1])
        except (ValueError, ZeroDivisionError):
            pass
    if re.search(r'\d\s*[-–]\s*\d|немного|щепот|небольш|средн|крупн', text):
        amount = None
    if re.match(r'ст', unit): unit = 'стакан' if unit.startswith('стакан') else 'ст.л.'
    elif re.match(r'ч', unit): unit = 'ч.л.'
    elif unit.startswith('зуб'): unit = 'зубчик'
    elif unit.startswith('г'): unit = 'г'
    elif unit.startswith('шт'): unit = 'шт'
    return {'product': product, 'amount': amount, 'unit': unit, 'sourceAmount': original}

def clean_lines(text):
    return [x.strip() for x in text.splitlines() if x.strip() and
            not re.search(r'^©|shkola_samoprikorma|^@|^www\.|^\d+$', x.strip(), re.I)]

def candidate(book, page, title, ingredient_text, body, text, ocr, index=0):
    lines = clean_lines(ingredient_text)
    rows = []
    for line in lines:
        if re.search(r'^для |^на |подача|замены|дополнения|количество порций|на фото', line, re.I): break
        if len(line) < 3: continue
        if not re.search(r'\d|по вкусу|соль|масло|масла|зелень|ягод|фрукт', line, re.I) and rows:
            rows[-1]['sourceAmount'] += ' ' + line
            # A wrapped ambiguous ingredient needs manual review.
            rows[-1]['amount'] = None
            continue
        rows.append(ingredient(line))
    if not rows:
        rows = [{'product': 'Состав нужно перенести из оригинала', 'amount': None, 'unit': 'г'}]
    title = tidy(title)
    identity = hashlib.sha256(f'{book}:{page}:{index}'.encode()).hexdigest()[:16]
    notes = ['Исходный текст сохранён. Возрастные и медицинские советы автора не проверены; название сборника не означает, что блюдо подходит любому ребёнку.']
    if ocr: notes.append('Распознано со скана: название, числа и порядок шагов требуют сверки с PDF.')
    if any(i['amount'] is None for i in rows): notes.append('Есть неуказанные или неоднозначные количества; полный расчёт пока недоступен.')
    return {'id': 'children-' + identity, 'title': title or f'Рецепт, страница {page}',
        'category': 'Детские рецепты — сверить', 'tags': ['детские', 'импорт', 'сверить с оригиналом'],
        'time': '', 'servings': '', 'method': 'raw', 'image': '', 'video': '',
        'ingredients': rows, 'steps': [{'text': body.strip() or text.strip(), 'image': ''}],
        'source': {'book': book, 'page': page, 'ocr': ocr},
        'nutritionReview': {'status': 'needs-review', 'notes': notes}}

def prepare(pages):
    records, inventory = [], []
    for folder in sorted(pages.iterdir()):
        if not folder.is_dir(): continue
        meta = json.loads((folder / 'source.json').read_text())
        book = meta['filename']; num = int(folder.name)
        for pagefile in sorted(folder.glob('*.txt')):
            page = int(pagefile.stem); text = pagefile.read_text(); low = text.lower()
            inv = {'book': book, 'page': page, 'classification': 'non-recipe'}
            inventory.append(inv)
            if num == 0 and not 39 <= page <= 216: continue
            if num == 1 and not 17 <= page <= 125: continue
            if num == 3 and not 5 <= page <= 111: continue
            if num == 4 and page < 18: continue
            if num == 5 and not re.search(r'\n\s*ингредиенты\s*\n', low): continue
            if num == 2:
                if page < 3: continue
                # This collection puts several recipes on a page. Preserve the
                # page as a review unit instead of guessing column boundaries.
                title = f'Идеи детских блюд — страница {page} (разделить рецепты)'
                records.append(candidate(book,page,title,'',text,text,False))
                inv['classification'] = 'multi-recipe-review'
                continue
            marker = re.search(r'ингредиент[ыа:]*(?:\s+приготовление)?', text, re.I)
            if marker:
                before=text[:marker.start()]; after=text[marker.end():]
                prep = re.search(r'(?:^|\n)\s*(?:[Кк]\s+)?приготовление\s*:?\s*(?:\n|$)', after, re.I)
                ing=after[:prep.start()] if prep else after
                body=after[prep.end():] if prep else text
                cutoff=re.search(r'подача|альтернативные замены|дополнения|количество порций',ing,re.I)
                if cutoff: ing=ing[:cutoff.start()]
            elif num == 3:
                # Handwritten headings are particularly error-prone in OCR.
                before=text.split('\n\n')[0]; ing=''; body=text
            elif num == 4 and 'приготовление' in low:
                before=text[:text.lower().index('приготовление')]; ing=''; body=text
            else:
                inv['classification']='unresolved-page'; continue
            title_lines=clean_lines(before)
            title_lines=[x for x in title_lines if not re.search(r'приготовление|подготовка|время приготовления|рецепт предоставлен|завтрак|обед|ужин',x,re.I)]
            if num == 0 and pagefile.with_suffix('.title').exists():
                title_lines=clean_lines(pagefile.with_suffix('.title').read_text())
                title_lines=[x for x in title_lines if not re.search(r'выпечка|каша|основные блюда|супы|салаты',x,re.I) or len(x)>25]
            title=' '.join(title_lines[:3])
            if num == 5: title=title_lines[-1] if title_lines else ''
            if num == 4:
                title=' '.join(title_lines[:2])
                # Amount-bearing lines are not part of the recipe heading.
                title=re.split(r'\d',title)[0].strip()
            records.append(candidate(book,page,title,ing,body,text,num in (0,1,3)))
            inv['classification']='recipe-review'
    SOURCE.parent.mkdir(exist_ok=True)
    SOURCE.write_text(json.dumps({'recipes':records,'pages':inventory},ensure_ascii=False,indent=2))
    print(f'Prepared {len(records)} review records from {len(inventory)} pages')

def build():
    source=json.loads(SOURCE.read_text())
    OUT.mkdir(parents=True,exist_ok=True)
    # Build only the review pack. Never move unrelated results or edit the
    # cross-project results index from a project-specific helper.
    stem='Детские_рецепты_черновики_v1_2026-10-04'
    pack={'format':'recipes-book','version':1,'recipes':source['recipes'],'customProducts':[]}
    target=OUT/(stem+'.json')
    target.write_text(json.dumps(pack,ensure_ascii=False,indent=2))
    script=r"""
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.argv[1],pack=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ctx=vm.createContext({});
vm.runInContext(['products','nutrition'].map(f=>fs.readFileSync(path.join(root,'js',f+'.js'),'utf8')).join('\n')+';var PRODUCTS=BUILTIN_PRODUCTS;this.calcRecipe=calcRecipe;',ctx);
console.log(JSON.stringify(pack.recipes.map(r=>{const x=ctx.calcRecipe(r).total;return {id:r.id,title:r.title,book:r.source.book,page:r.source.page,knownIngredientCount:r.ingredients.length-x.missing.length,ingredientCount:r.ingredients.length,kcalKnownIngredients:Math.round(x.raw.kcal),proteinKnown:x.raw.protein,fatKnown:x.raw.fat,carbsKnown:x.raw.carbs,complete:x.complete,giEstimateKnownIngredients:x.gi,giCoverage:x.giCoverage};})));
"""
    calculations=json.loads(subprocess.check_output(['node','-e',script,str(ROOT),str(target)],text=True))
    (OUT/(stem+'_расчёт.json')).write_text(json.dumps(calculations,ensure_ascii=False,indent=2))
    (OUT/(stem+'_покрытие.json')).write_text(json.dumps(source['pages'],ensure_ascii=False,indent=2))
    audit=json.loads((ROOT/'private'/'audit-source.json').read_text())
    esc=lambda x: html.escape(str(x))
    report=['<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>'+esc(audit['title'])+'</title><style>body{font:16px/1.55 system-ui;color:#2e2620;background:#faf7f2;margin:0}main{max-width:1040px;margin:auto;padding:28px}h1{font-size:28px}h2{margin-top:36px}table{border-collapse:collapse;width:100%;font-size:15px}td,th{padding:12px;text-align:left;border-bottom:1px solid #9c8f7e;vertical-align:top}a{color:#9a4719}li{margin-bottom:14px}.screens{display:flex;flex-wrap:wrap;gap:24px}img{max-width:100%;width:300px;height:auto}small{color:#736859}.finding{padding:16px 0;border-bottom:1px solid #9c8f7e}code{overflow-wrap:anywhere}@media(max-width:600px){main{padding:16px}table{font-size:13px}td,th{padding:8px}}</style><main>',
      '<h1>'+esc(audit['title'])+'</h1><p>'+esc(audit['date'])+'</p><p>'+esc(audit['method'])+'</p>',
      '<p>'+esc(audit['verdict'])+'</p><h2>Замечания по важности</h2>']
    for finding in sorted(audit['findings'],key=lambda x:x['severity']):
        report.append('<section class="finding"><h3>'+esc(finding['severity']+' · '+finding['title'])+'</h3><p>'+esc(finding['impact'])+'</p><p>'+esc(finding['recommendation'])+'</p><p><strong>Статус:</strong> '+esc(finding['status'])+'</p><small>'+esc(finding['lens']+' · '+finding['location'])+'</small></section>')
    report.append('<h2>Оценка технического состояния: '+str(sum(x[1] for x in audit['scores']))+'/20</h2><table><thead><tr><th>Область</th><th>Баллы</th><th>Основание</th></tr></thead><tbody>')
    for dimension,score,note in audit['scores']:
        report.append('<tr><td>'+esc(dimension)+'</td><td>'+str(score)+'/4</td><td>'+esc(note)+'</td></tr>')
    report.append('</tbody></table><p>'+esc(audit['detector'])+'</p><h2>Сборники: что подготовлено</h2>')
    report.append(f'<p>Шесть PDF, {len(source["pages"])} страниц. Предварительно {len(source["recipes"])} единиц сверки. Подтверждённых полных расчётов: {sum(x["complete"] for x in calculations)}. Данные не добавлены в живую семейную книгу.</p>')
    report.append('<p><a href="'+esc(stem+'.json')+'">Приватный пакет черновиков</a> · <a href="'+esc(stem+'_расчёт.json')+'">Ведомость известной части состава (не итог блюда)</a> · <a href="'+esc(stem+'_покрытие.json')+'">Покрытие страниц</a></p>')
    report.append('<p>Пакет предназначен для сверки. Не импортируйте его как готовые рецепты с проверенными количествами. После сверки можно добавлять в книгу с объединением, не заменой. Рецепты и имена текущей книги сохраняются; повторная загрузка идентичных записей пакета не создаёт дубли.</p>')
    report.append('<h2>Снимки мобильного интерфейса</h2><div class="screens">')
    for label,title in [('list','Список рецептов'),('detail','Карточка рецепта')]:
        src=Path('/private/tmp/recipes-pdf-review')/f'ui-360-{label}.png'
        dest=OUT/f'UX_{label}_v1_2026-10-04.png'
        if src.exists():
            import shutil
            shutil.copy2(src,dest)
            report.append('<figure><img src="'+esc(dest.name)+'" alt="'+esc(title)+'"><figcaption>'+esc(title)+'</figcaption></figure>')
    report.append('</div><h2>Ограничения проверки</h2><ul>')
    report.extend('<li>'+esc(item)+'</li>' for item in audit['limitations'])
    report.append('</ul><h2>Источники расчётных принципов</h2><ul>')
    report.extend('<li><a href="'+esc(url)+'">'+esc(title)+'</a></li>' for title,url in audit['sources'])
    report.append('</ul></main></html>')
    report_name='UX_UI_рецептов_v1_2026-10-04.html'
    (OUT/report_name).write_text('\n'.join(report))
    print(json.dumps({'output':str(target),'records':len(pack['recipes']),'allIngredientsMatched':sum(x['knownIngredientCount']==x['ingredientCount'] for x in calculations),'fullCalculationConfirmed':sum(x['complete'] for x in calculations)},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--prepare',type=Path)
    args=parser.parse_args()
    if args.prepare: prepare(args.prepare)
    build()
