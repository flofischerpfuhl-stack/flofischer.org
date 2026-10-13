// Passphrase word list: short, common, easy-to-type English words (deduplicated at load).
// The real build should ship the EFF large list (7,776 words, CC BY 3.0); the strength maths below uses the actual length.
const RAW = `
able acid acorn acre actor adapt adobe after agent agile alarm album alert algae alias alley allow almond alpine amber
ample angle ankle apple apron arbor arena argue arrow artist aspen atlas attic audio august autumn avenue award awake
bacon badge bagel baker bamboo banana banjo barge barley barn basil basin basket beach beacon beads beagle beam bean
bear beaver bedrock beet bell belt bench berry bicycle bird biscuit bison blade blanket blaze blend blink bloom blossom
blue board boat bonus book boot border bottle boulder bounce bowl box brave bread breeze brick bridge brief bright brook
broom brush bubble bucket buckle buddy budget buffalo bugle bundle bunny butter button cabin cable cactus cake camel
camera camp canal candle candy canoe canvas canyon cape captain caramel carbon card cargo carpet carrot cart castle
cedar celery cellar cello cement cereal chalk channel chapel charm chart cheek cheese cherry chess chest chimney chip
choir chorus cider cinema circle citrus city clay cliff climb clock cloud clover coach coast cobalt cocoa coconut
coffee comet compass copper coral cotton couch cougar country cousin cowboy coyote crab cradle crane crater crayon
cream creek cricket crisp crown crumb crystal cube cupcake curtain cushion cycle daisy dance dawn decade deck delta
denim desert desk dial diary diesel dinner dock dolphin domain donkey donut dove dragon drawer dream drift drum duck
dune dusk eagle earth easel echo eclipse edge elbow elder ember emerald engine equal error estate exact fabric falcon
fable family fancy farm feast feather fence ferry fiber fiddle field fig film finch fire fiscal flag flame flannel
flute foam focus fog folder forest fork fossil fountain fox frame fresh frost fruit fudge galaxy garden garlic gate
gazelle gecko gentle giant ginger giraffe glacier glass globe glove goat gold golf goose gopher gospel grain granite
grape graph grass gravel green grill grove guitar gull habit hammer hamster harbor harp harvest hatch hawk hazel
heart hedge helmet herb heron hill hippo hobby honey hoop horizon horn horse hotel hound house hummus husky igloo
index indigo inlet insect iris island ivory jacket jaguar jam jasmine jazz jelly jersey jewel jigsaw jockey journal
jungle juniper karma kayak kernel kettle kidney kitten kiwi knee knight koala label ladder lagoon lake lamp lantern
laptop latte lava lawn layer leaf ledge lemon lens lentil letter level lilac lily lime linen lion lizard llama lobster
locket lodge logic lotus lucky lumber lunar lunch lynx magnet mango maple marble market marsh mask meadow melody melon
mentor meteor metro midnight mint mirror mitten mocha model monkey moose morning mosaic moss motor mountain mouse
muffin mural museum mustard nature nectar needle nest nickel noble noodle north nugget nutmeg oasis oat ocean octave
olive omega onion opal orbit orchid otter outlet oven owl oyster paddle pagoda paint palace palm panda panel panther
paper parade parcel parrot pasta pastel patio peach peanut pearl pebble pecan pelican pencil pepper piano pickle pigeon
pillow pilot pine pioneer pirate pizza planet plaza plum pocket poem polar pond poppy porch potato pottery prairie
prism pudding pumpkin puppy puzzle python quail quartz quest quiet quilt quiz rabbit raccoon radar radio radish raft
rain raisin ranch raven razor recipe reef relay ribbon rice ridge river robin rocket rodeo roof rose ruby rugby ruler
saddle safari saffron sage salad salmon salt sandal sardine satin sauce savanna scarf school scout sea seal season
seed shadow shark shell shelter sherbet shield ship shore shovel shrimp signal silk silver siren sketch ski sky slate
sleeve slope smile snail snow soap socket sofa solar sonic soup spice spider spinach sponge spoon spring sprout spruce
square squid stable stage stamp star statue steam stone stork storm story stove straw stream street studio sugar summit
sun sunset swallow swan sweater syrup table taco tango tea teapot temple tennis tent thistle thunder ticket tiger
timber toast token tomato topaz torch tortoise towel tower tractor trail train tree trophy trout truck tulip tuna
tundra tunnel turkey turnip turtle tuxedo twig umbrella unicorn urban valley vanilla vapor velvet venus verse violet
violin visa vision vivid volcano voyage waffle wagon walnut walrus wander water wave wheat whale wheel whisper willow
window winter wizard wolf wombat wood wool yacht yarn yeast yellow yogurt zebra zephyr zero zigzag zinc zipper zone
acorn agate alder alloy amigo anchor antler anvil apricot aqua arch arcade argon ash attic avocado axle badger bakery
balsa banner barrel basalt bayou bazaar beetle begonia bell bistro blimp blouse blueberry bobcat bolt bonsai bramble
brass bronze buckwheat bugle burrow cabbage cameo candor caper cardigan caribou cashew cavern chamomile chariot cheetah
chestnut chipmunk chisel cinnamon clam clarinet cleat cobble cockpit codex compass condor cookie cork cornet cove
cranberry crest crocus cumin cypress dahlia dandelion delta diamond dingo domino dragonfly drizzle dynamo egret elm
elk emu espresso evergreen fennel fern fjord flamingo flax flint florist fondue foxglove freckle fresco galleon gamut
garnet gazebo geyser gingko glider gnome goblet gondola gorge gourd granola griffin grotto guava gumbo halibut harbor
hazelnut heather hemlock hickory hiker hornet hyacinth ibis iceberg icicle iguana impala ingot jackal jade jetty juggle
kale kelp kestrel kimono kiosk ladle lapis larch lark laurel lemur levee lichen lilypad linden lupine macaw magpie
malt mammoth manatee mandolin mantis marigold marina marlin marmot meringue mesa millet mimosa minnow mistral mohair
monsoon moped mulberry musket nacho narwhal nautilus nebula nettle nimbus nomad nougat oatmeal obsidian ocelot okra
opera oregano osprey paprika papaya parsley parsnip peacock pepper perch petal pewter pheasant piccolo pinecone
pistachio plover pollen poncho porcupine praline pretzel primrose puffin quasar quince quiver radius ravioli redwood
reindeer rhubarb riddle robot rosemary rowboat rye sable salsa sandbar sapphire satchel scallop schooner sequoia sesame
sherpa sienna skylark sloop snapper sorrel sparrow spatula sprocket starling sundial swift tadpole tamarind tapir
tarragon teal thimble thyme toucan trellis trumpet tugboat turban turquoise ukulele urchin vellum veranda vortex
waffle wasabi weasel whistle wigwam wildcat windmill wren yodel yucca zenith zucchini
`;
export const WORDS = [...new Set(RAW.split(/\s+/).filter((w) => /^[a-z]{3,9}$/.test(w)))];
