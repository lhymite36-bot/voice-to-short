import json, random, sys, subprocess, wave, struct, math, os
random.seed(int(sys.argv[3]) if len(sys.argv)>3 else 1)
target_min = float(sys.argv[1]); out = sys.argv[2]
TOPICS = {
 'Sketching': ["Grab a pencil and a small sketchbook.", "Draw your coffee mug every morning.", "Sketch the plants on your windowsill.", "Your hand slowly learns to follow your eyes.", "Flip back through the pages after a month.", "You will see real progress in your drawings.", "Try painting with a cheap brush on weekends.", "Sketching in a cafe helps you notice people."],
 'Money': ["Track every rupee you spend in a notebook.", "Put a little cash in a savings jar each week.", "Count your money at the end of the month.", "Pay with cash so spending feels real.", "Shopping with a list stops impulse buys.", "Take the bus instead of a cab.", "Cook at home instead of ordering food.", "Small savings add up to big money."],
 'Fitness': ["Start with ten minutes of exercise a day.", "Lift light weights at the gym twice a week.", "Stretch in the park before you run.", "Drink water before every workout.", "Yoga on a mat calms your whole body.", "Dance in your living room when you feel stuck.", "Running in the morning wakes up your brain.", "Rest days help your muscles grow."],
 'Study': ["Study in the library where it is quiet.", "Read one chapter before you sleep.", "Write short notes by hand.", "Teach a friend what you learned.", "Put your phone away while you study.", "Take a short walk between sessions.", "Review your notes on the bus.", "Practice old questions before the exam."],
 'Cooking': ["Cook a simple meal in your kitchen.", "Chop vegetables while the pan heats up.", "Eat slowly and enjoy your food.", "Make tea in the morning instead of buying coffee.", "Wash the dishes right after dinner.", "Try one new recipe every week.", "Share a meal with a friend.", "Pack lunch the night before."],
 'Calm': ["Close your eyes and breathe slowly.", "Meditate for five minutes before bed.", "Listen to music on the way home.", "Call a friend when you feel low.", "It is okay to cry sometimes.", "Write three things you are grateful for.", "Hug the people you love.", "Laugh at a silly video with family."],
 'Work': ["Type your plan on the laptop first.", "Present your idea with confidence.", "Take photos of your work to share.", "Code for one hour without distractions.", "Wave hello to your team in the morning.", "Clean your desk at the end of the day.", "Text your manager a quick update.", "Celebrate small wins with your team."],
}
names = list(TOPICS)
words_per_min = 150
target_words = target_min * 60 * words_per_min / 60 * 0.97
sections = []; total_words = 0; k = 0
while total_words < target_words:
    topic = names[k % len(names)]; k += 1
    lines = TOPICS[topic][:]; random.shuffle(lines)
    sec_lines = ["Part %d. Let's talk about %s." % (k, topic.lower())] + lines + lines[:3]
    sections.append({'title': topic, 'lines': sec_lines})
    total_words += sum(len(l.split()) for l in sec_lines)
json.dump(sections, open(out + '.json', 'w'), indent=1)
print(len(sections), 'sections', total_words, 'words')
