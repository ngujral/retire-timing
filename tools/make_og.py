from PIL import Image, ImageDraw, ImageFont
OUT='/home/claude/retire-timing'
ACC, SAGE, INK, WHITE = (14,107,82), (238,242,239), (15,36,29), (255,255,255)
S1, S2 = (42,120,214), (235,104,52)
k=2; W,H=1200*k,630*k
im=Image.new('RGB',(W,H),SAGE); d=ImageDraw.Draw(im)
F=lambda w,s: ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{w}.otf', s*k)
m=Image.open('logo192.png').convert('RGBA'); im.paste(m,(80*k-8,64*k),m)
d.text((196*k,92*k),'Retire Timing',font=F('ExtraBold',46),fill=INK)
d.text((80*k,210*k),'When to start CPP and OAS?',font=F('ExtraBold',68),fill=INK)
d.text((80*k,310*k),'Your choice vs. 65 vs. 70, after tax, the OAS',font=F('Medium',34),fill=(83,98,92))
d.text((80*k,356*k),'clawback and your RRSP, TFSA and savings.',font=F('Medium',34),fill=(83,98,92))
d.text((80*k,520*k),'retiretiming.ca  ·  free  ·  private',font=F('Bold',30),fill=ACC)
x0,x1,y0,y1=800*k,1130*k,560*k,420*k
def pts(start,slope):
    out=[]
    for i in range(41):
        t=i/40; age=61+29*t; v=0 if age<start else (age-start)*slope
        out.append((x0+(x1-x0)*t, y0-v/(29*1.42)*(y0-y1)))
    return out
d.line([(x0,y0),(x1,y0)],fill=(207,216,211),width=3*k)
d.line(pts(65,1.0),fill=S1,width=6*k,joint='curve')
d.line(pts(70,1.42),fill=S2,width=6*k,joint='curve')
cx=x0+(x1-x0)*((82.1-61)/29); cy=y0-(82.1-65)/(29*1.42)*(y0-y1)
d.ellipse([cx-14*k,cy-14*k,cx+14*k,cy+14*k],fill=WHITE,outline=INK,width=4*k)
im.resize((1200,630),Image.LANCZOS).save(f'{OUT}/og.png',optimize=True)
