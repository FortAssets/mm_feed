// Specificaties uit de productfeed van MediaMarkt (Tradedoubler).
//
// De feed geeft per product een lijst velden met Engelse sleutels en
// Nederlandse waarden, bijvoorbeeld bluetooth_version = 5.2. Hier staat welke
// sleutels op de productpagina komen, onder welke kop en met welk label. Een
// sleutel die hier niet staat, komt niet op de pagina. Zo verschijnt er nooit
// een halve Engelse regel of een intern veld als advertiser_id.
//
// Volgorde telt: binnen een groep staan de belangrijkste regels bovenaan, want
// er gaan er hoogstens PER_GROEP per groep op de pagina.

const PER_GROEP = 8
const MAX_GROEPEN = 12
const MAX_RIJEN = 60

// [sleutel, label] of [[sleutel, alternatief, ...], label]: de eerste gevulde wint.
const GROEPEN = [
  ['Algemeen', [
    ['product_type', 'Soort'],
    ['model', 'Model'],
    ['model_year', 'Modeljaar'],
    ['color', 'Kleur'],
    ['device_type', 'Type apparaat'],
    ['construction_shape', 'Uitvoering'],
    ['construction_type', 'Bouwtype'],
    ['build', 'Bouwwijze'],
    ['design', 'Vormgeving'],
    ['case_material', 'Materiaal behuizing'],
    ['compatible_with', 'Geschikt voor'],
    ['special_features', 'Bijzonderheden'],
    ['scope_of_delivery', 'Meegeleverd'],
    ['manufacturer_part_number', 'Artikelnummer fabrikant']
  ]],
  ['Scherm', [
    [['display_size_cm_inch', 'screen_diagonal_cm_inch', 'screen_diagonal_inches', 'screen_diagonal_cm'], 'Schermdiagonaal'],
    ['displaytype', 'Schermtype'],
    ['panel_type', 'Paneeltype'],
    [['resolution', 'resolution_h_w'], 'Resolutie'],
    ['image_quality', 'Beeldkwaliteit'],
    ['frame_rate', 'Verversingssnelheid'],
    ['brightness', 'Helderheid'],
    ['high_dynamic_range', 'HDR'],
    ['image_ratio', 'Beeldverhouding'],
    ['pixel_density', 'Pixeldichtheid'],
    ['screen_type', 'Schermafwerking'],
    ['led_technology', 'Led-techniek'],
    ['ambilight', 'Ambilight'],
    ['touchscreen', 'Touchscreen'],
    ['touchscreen_typ', 'Type touchscreen'],
    ['convertibility', 'Uitvoering scherm'],
    ['curved_display', 'Gebogen scherm'],
    ['anti_scratch_display', 'Krasbestendig scherm'],
    ['picture_improvement_system', 'Beeldmodi'],
    ['led_backlight', 'Led-achtergrondverlichting'],
    ['ultra_hd_premium', 'Ultra HD Premium'],
    ['color_display', 'Kleurenscherm'],
    ['number_of_displays', 'Aantal schermen']
  ]],
  ['Processor en geheugen', [
    ['processor', 'Processor'],
    ['processor_brand', 'Merk processor'],
    ['processor_model', 'Processormodel'],
    ['number_of_processor_cores', 'Aantal kernen'],
    ['memory_size', 'Werkgeheugen'],
    [['memory_capacity', 'total_storage_space_in_gb'], 'Opslag'],
    ['hard_disk_1', 'Schijf'],
    ['dedicated_graphics_memory', 'Videogeheugen'],
    ['ram_type', 'Type werkgeheugen'],
    ['processor_clock_rate', 'Kloksnelheid'],
    ['processor_speed_with_turbo', 'Snelheid met turbo'],
    ['ram_configuration', 'Indeling werkgeheugen'],
    ['memory_speeds', 'Snelheid werkgeheugen'],
    ['memory_card_types', 'Geheugenkaart'],
    ['maximum_memory_card_capacity', 'Maximale geheugenkaart'],
    ['card_reader', 'Kaartlezer']
  ]],
  ['Camera', [
    ['back_camera', 'Camera achter'],
    ['specs_back_camera', 'Resolutie camera achter'],
    ['front_camera_smartphone', 'Camera voor'],
    ['specs_front_camera', 'Resolutie camera voor'],
    ['video_resolution', 'Videoresolutie'],
    ['image_stabilizer', 'Beeldstabilisatie'],
    ['optical_zoom', 'Optische zoom'],
    ['digital_zoom', 'Digitale zoom'],
    ['autofocus', 'Autofocus'],
    ['integrated_flash', 'Flitser'],
    ['image_sensor', 'Beeldsensor'],
    ['camera_functions', 'Camerafuncties'],
    ['integrated_webcam', 'Webcam'],
    ['front_camera', 'Camera voor']
  ]],
  ['Verbinding', [
    ['mobile_phone_standard', 'Mobiel netwerk'],
    ['dual_sim', 'Dual sim'],
    ['sim_card_size', 'Type simkaart'],
    ['signal_transmission', 'Signaaloverdracht'],
    ['connections', 'Aansluitingen'],
    ['number_of_hdmi_connectors', 'HDMI-aansluitingen'],
    ['number_of_usb_ports', 'USB-poorten'],
    ['wlan', 'Wifi'],
    ['wlan_standards', 'Wifi-standaard'],
    ['bluetooth', 'Bluetooth'],
    ['bluetooth_version', 'Bluetooth-versie'],
    ['near_field_communication', 'NFC'],
    ['integrated_gps_module', 'Gps'],
    ['satellite_navigation_system', 'Satellietnavigatie'],
    ['range', 'Bereik'],
    ['cable_length', 'Kabellengte'],
    ['sim_card_included', 'Simkaart meegeleverd']
  ]],
  ['Slimme functies', [
    ['smart_tv', 'Smart tv'],
    ['internet_functions', 'Apps'],
    ['chromecast_built_in', 'Chromecast ingebouwd'],
    ['reception_types', 'Ontvangst'],
    ['ci_certified', 'CI+'],
    ['compatible_operating_system', 'Werkt met'],
    ['compatible_platform', 'Platform'],
    ['compatible_with_app', 'Werkt met app'],
    ['compatible_with_apps', 'App voor'],
    ['voice_control', 'Spraakbesturing'],
    ['notification_of', 'Meldingen van'],
    ['internet_capable', 'Internet'],
    ['electronic_program_guide', 'Programmagids'],
    ['picture_in_picture', 'Beeld in beeld']
  ]],
  ['Geluid', [
    ['noise_suppression', 'Ruisonderdrukking'],
    ['integrated_mike', 'Microfoon'],
    ['frequency_response', 'Frequentiebereik'],
    ['nominal_impedance', 'Impedantie'],
    ['sensitivity', 'Gevoeligheid'],
    ['number_of_channels', 'Kanalen'],
    ['sound_system', 'Geluidssysteem'],
    ['musical_output', 'Muziekvermogen'],
    ['high_resolution_audio', 'Hi-res audio'],
    ['dolby_surround', 'Dolby Surround'],
    ['headset_function', 'Headsetfunctie'],
    ['volume_control', 'Volumeregeling'],
    ['mute', 'Dempknop'],
    ['volume_limiter', 'Volumebegrenzer'],
    ['folding_design', 'Opvouwbaar'],
    ['rotating_ear_cups', 'Draaibare oorschelpen'],
    ['ear_cushions_material', 'Materiaal oorkussens'],
    ['speakers', 'Luidsprekers'],
    ['integrated_amplifier', 'Ingebouwde versterker'],
    ['built_in_music_player', 'Muziekspeler']
  ]],
  ['Sport en sensoren', [
    ['heart_rate_sensor', 'Hartslagmeter'],
    ['sports', 'Sporten'],
    ['recording_and_display_of', 'Registreert'],
    ['sensors', 'Sensoren'],
    ['fingerprint_sensor', 'Vingerafdrukscanner'],
    ['facial_recognition', 'Gezichtsherkenning'],
    ['barometric_altimeter', 'Hoogtemeter'],
    ['compass', 'Kompas'],
    ['acceleration_sensor', 'Versnellingsmeter'],
    ['ambient_light_sensor', 'Lichtsensor'],
    ['thermometer', 'Thermometer'],
    ['depth_meter', 'Dieptemeter'],
    ['automatic_motion_detection', 'Automatische bewegingsherkenning'],
    ['time_indicator', 'Tijdweergave'],
    ['material_of_watchstrap', 'Materiaal band'],
    ['size_of_watch_strap', 'Bandbreedte'],
    ['watchstrap_interchangeable', 'Band verwisselbaar'],
    ['watch_case_color', 'Kleur kast'],
    ['alarm_function', 'Wekker'],
    ['calendar_date_book_function', 'Agenda']
  ]],
  ['Koffie', [
    ['suitable_type_of_coffee', 'Geschikt voor'],
    ['programs', 'Programma\'s'],
    ['milk_foamer', 'Melkopschuimer'],
    ['integrated_grinder', 'Ingebouwde molen'],
    ['pump_pressure', 'Pompdruk'],
    ['capacity_of_water_tank', 'Inhoud waterreservoir'],
    ['content_of_bean_container', 'Inhoud bonenreservoir'],
    ['variable_brewing_temperature', 'Instelbare temperatuur'],
    ['aroma_selection_switch', 'Sterkte instelbaar'],
    ['cup_size_adjustable', 'Kopgrootte instelbaar'],
    ['auto_cappuccino_system', 'Automatisch cappuccinosysteem'],
    ['hot_water_steam', 'Heet water en stoom'],
    ['heated_cup_tray', 'Kopjesverwarmer'],
    ['water_filter', 'Waterfilter'],
    ['removable_water_tank', 'Waterreservoir uitneembaar'],
    ['removable_milk_container', 'Melkreservoir uitneembaar'],
    ['cleaning_program', 'Reinigingsprogramma'],
    ['cleaning_and_descaling_warning', 'Ontkalkmelding'],
    ['anti_drip_function', 'Druppelstop']
  ]],
  ['Stofzuigen', [
    ['area_of_application_vacuum_cleaner', 'Geschikt voor'],
    ['bagless_technology', 'Zonder zak'],
    ['filter_type', 'Filter'],
    ['suction_control', 'Zuigkracht regelbaar'],
    ['type_of_brushes', 'Borstels'],
    ['wet_dry_suction_function', 'Nat en droog'],
    ['animal_brush', 'Dierenborstel'],
    ['electric_brush', 'Elektrische borstel'],
    ['washable_filter', 'Filter uitwasbaar'],
    ['number_filter_stages', 'Aantal filterstappen'],
    ['combined_brush_carpets_solid_floors', 'Combiborstel tapijt en harde vloer'],
    ['controller_on_handle', 'Bediening op handgreep'],
    ['brushless_motor', 'Borstelloze motor'],
    ['telescoping_tube', 'Telescoopbuis'],
    ['cable_spool', 'Snoeropwinder'],
    ['park_system_suction', 'Parkeerstand'],
    ['filter_change_indicator', 'Filterwisselindicator'],
    ['accessory_holder', 'Accessoirehouder']
  ]],
  ['Koelen en vriezen', [
    ['number_doors', 'Aantal deuren'],
    ['freezer_compartment', 'Vriesvak'],
    ['freezer_compartment_position', 'Plaats vriesvak'],
    ['frost_free', 'No frost'],
    ['star_rating', 'Sterren vriesvak'],
    ['number_of_shelves_in_cooling_section', 'Plateaus in koeldeel'],
    ['number_of_freezer_compartments', 'Vriesladen'],
    ['drawers_refrigeration_compartment', 'Laden in koeldeel'],
    ['number_of_door_compartments', 'Deurvakken'],
    ['shelves_material', 'Materiaal plateaus'],
    ['quick_cooling_function', 'Snelkoelen'],
    ['ice_dispenser', 'IJsdispenser'],
    ['interior_illumination', 'Binnenverlichting'],
    ['door_stopper', 'Deurscharnier'],
    ['storage_times_in_event_of_disruption', 'Bewaartijd bij storing'],
    ['integrated_bottle_holder', 'Flessenrek']
  ]],
  ['Wassen en drogen', [
    ['loading', 'Belading'],
    [['filling_quantity', 'filling_quantity_cotton_dry'], 'Vulgewicht'],
    ['spin_speed_rated_capacity', 'Toerental'],
    ['number_of_programs', 'Aantal programma\'s'],
    ['drum_volume', 'Trommelinhoud'],
    ['steam_function', 'Stoomfunctie'],
    ['moisture_sensor', 'Vochtsensor'],
    ['automatic_dosage', 'Automatisch doseren'],
    ['spin-drying_efficiency_class', 'Centrifugeklasse'],
    ['programme_duration_rated_capacity', 'Programmaduur'],
    ['anticreasing_function', 'Kreukbeveiliging'],
    ['configurable_start_time', 'Startuitstel'],
    ['remaining_time_display', 'Resttijdweergave'],
    ['overflow_protection', 'Overloopbeveiliging'],
    ['childproofing', 'Kinderslot'],
    ['drum_material', 'Materiaal trommel'],
    ['heating_system', 'Verwarming']
  ]],
  ['Accu en stroom', [
    [['battery_capacity_smartphone', 'battery_capacity'], 'Accucapaciteit'],
    [['battery_life', 'maximum_operating_time'], 'Accuduur'],
    ['charge_time_from_manufacturer', 'Oplaadtijd'],
    ['quick_recharge', 'Snelladen'],
    ['wireless_charging', 'Draadloos opladen'],
    ['battery_type', 'Type accu'],
    ['standby_time', 'Stand-bytijd'],
    ['battery_replaceable', 'Accu verwisselbaar'],
    ['charger_base', 'Laadstation'],
    ['operating_mode', 'Voeding'],
    ['maximum_power', 'Vermogen'],
    ['input_voltage', 'Spanning'],
    ['length_of_power_cable', 'Lengte snoer']
  ]],
  ['Energie en geluid', [
    [['energy_efficiency_class_2017', 'energy_efficiency_class_2010'], 'Energieklasse'],
    [['eu_energy_efficiency_scale_2017', 'eu_energy_efficiency_scale'], 'Schaal energieklasse'],
    ['weighted_energy_consumption_per_100_cycles_in_kwh', 'Verbruik per 100 cycli'],
    ['annual_energy_consumption_electrically_heated', 'Verbruik per jaar'],
    ['on_mode_energy_consumption_in_kwh_playing_sdr_content', 'Verbruik per 1000 uur (SDR)'],
    ['on_mode_energy_consumption_in_kwh_playing_hdr_content', 'Verbruik per 1000 uur (HDR)'],
    [['sound_power_level', 'noise_power'], 'Geluidsniveau'],
    ['airborne_acoustical_noise_emission_class_spinning_phase', 'Geluidsklasse centrifugeren'],
    ['eco_mode', 'Eco-stand']
  ]],
  ['Bediening en gemak', [
    ['operation_via', 'Bediening via'],
    ['type_of_control', 'Bediening'],
    ['control_elements', 'Bedieningselementen'],
    ['automatic_off', 'Automatisch uit'],
    ['pre_programmed_turn_on_time', 'Timer'],
    ['temperature_control', 'Temperatuurregeling'],
    ['level_indicator', 'Niveau-indicator'],
    ['keyboard_type', 'Toetsenbord'],
    ['illumination', 'Verlichting'],
    ['adjustable_feet', 'Verstelbare poten'],
    ['wheels', 'Wielen']
  ]],
  ['Bestendigheid en updates', [
    ['ip_code', 'IP-klasse'],
    ['waterproof', 'Waterdicht'],
    ['splash_proof', 'Spatwaterdicht'],
    ['manufacturer_supported_software_updates', 'Software-updates van fabrikant'],
    ['min_duration_supported_software_updates', 'Updates minimaal'],
    ['manufacturer_guarantee', 'Fabrieksgarantie']
  ]],
  ['Afmetingen en gewicht', [
    [['dimensions_weight', 'dimensions'], 'Afmetingen'],
    [['product_width'], 'Breedte'],
    [['product_height', 'height'], 'Hoogte'],
    [['product_depth', 'depth'], 'Diepte'],
    [['weight', 'weight_manufacturer'], 'Gewicht'],
    ['weight_with_stand', 'Gewicht met voet'],
    ['weight_without_stand', 'Gewicht zonder voet'],
    ['depth_without_stand', 'Diepte zonder voet'],
    ['vesa_standard', 'VESA'],
    ['depth_of_product_with_door_open', 'Diepte met open deur'],
    ['niche_height_minimum', 'Nishoogte minimaal'],
    ['niche_depth_minimum', 'Nisdiepte minimaal']
  ]]
]

const LEEG = /^(niet beschikbaar|not available|nvt|n\.v\.t\.?|geen|onbekend|-+|0 ?(gb|mb|mah|g|kg|mm|cm|w)?|geen aanvullende.*)$/i

function schoon (v) {
  let s = String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[®™]/g, '').replace(/\s+/g, ' ').trim()
  // "A , B , C" en "A | B" lezen als opsomming.
  s = s.replace(/\s+,/g, ',').replace(/\s*\|\s*/g, ', ')
  if (!s || LEEG.test(s) || s.length > 140) return ''
  return s
}

// velden: { sleutel: waarde } uit de feed. Geeft { g: [{ t, r: [[label, waarde]] }] } of null.
export function mmSpecs (velden) {
  if (!velden) return null
  const g = []
  let rijen = 0
  const afmetingenCompleet = !!schoon(velden.dimensions_weight)
  for (const [titel, regels] of GROEPEN) {
    if (g.length >= MAX_GROEPEN || rijen >= MAX_RIJEN) break
    const r = []
    const gezien = new Set()
    for (const [sleutels, label] of regels) {
      if (r.length >= PER_GROEP || rijen + r.length >= MAX_RIJEN) break
      if (gezien.has(label)) continue
      // Staat alles al in een regel "b x h x d / gewicht", dan de losse maten weglaten.
      if (afmetingenCompleet && /^(Breedte|Hoogte|Diepte|Gewicht)$/.test(label)) continue
      let waarde = ''
      for (const k of (Array.isArray(sleutels) ? sleutels : [sleutels])) { waarde = schoon(velden[k]); if (waarde) break }
      if (!waarde) continue
      // De feed zet soms een bereik in meters bij het frequentiebereik.
      if (label === 'Frequentiebereik' && !/hz/i.test(waarde)) continue
      gezien.add(label)
      r.push([label, waarde])
    }
    // Een groep met alleen maar "Nee" zegt niets en hoort bij een ander soort product.
    if (!r.length || r.every(x => /^nee$/i.test(x[1]))) continue
    g.push({ t: titel, r }); rijen += r.length
  }
  // Minder dan vijf regels is geen specificatielijst.
  if (rijen < 5) return null
  return { g }
}

export const MM_SLEUTELS = new Set(GROEPEN.flatMap(([, regels]) => regels.flatMap(([s]) => Array.isArray(s) ? s : [s])))
