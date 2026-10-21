# SunWater Konya

**AI-powered irrigation planning for sustainable groundwater management.**

SunWater Konya is a data-driven irrigation planning project designed to help farmers in the Konya Closed Basin, Türkiye, make better irrigation decisions while reducing unnecessary groundwater extraction.

The project combines crop water requirement estimation, weather forecasts, rainfall data, and solar energy availability to generate practical irrigation recommendations tailored to individual fields.

## The Problem

Groundwater over-abstraction in the Konya Closed Basin raises concerns about declining groundwater levels, agricultural sustainability, and sinkhole formation. Solar-powered irrigation can reduce pumping costs, but without effective water management, low marginal energy costs may weaken incentives to conserve groundwater.

## Our Approach

- **Crop water requirements:** Estimate reference evapotranspiration (ET₀) and crop evapotranspiration (ETc) using FAO-56 principles.
- **Weather-aware irrigation:** Incorporate rainfall forecasts and weather data into irrigation planning.
- **Solar-aware scheduling:** Align pumping recommendations with expected solar energy availability.
- **Accessible recommendations:** Use AI to translate structured calculations into clear, farmer-friendly guidance.
- **Impact estimation:** Track estimated water savings, pumping energy use, and associated emissions under explicitly stated assumptions.

## Technology Stack

- React and TypeScript
- Open-Meteo weather and evapotranspiration APIs
- FAO-56 crop water requirement methodology
- Gemini API for natural-language interaction

## Project Goals

The long-term goal is to support more efficient agricultural water use, reduce avoidable groundwater extraction, and contribute to sustainable irrigation practices in the Konya Closed Basin.

**Important:** Water savings, emissions reductions, and impacts on sinkhole risk are targets to be evaluated through field measurements and validated data. They are not yet established outcomes of the project.
